import OpenAI from "openai";
import type { Config } from "../config.js";

export interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmResponse {
  content: string | null;
  toolCalls: { id: string; name: string; args: unknown }[];
  /** Provider-reported token usage, when available (#56b metering). */
  usage?: TokenUsage;
}

/** The narrator contract the turn loop depends on (real or mock). */
export interface Llm {
  /**
   * Run one chat-completions round. When `onDelta` is provided, content tokens
   * are streamed to it as they arrive (#32); the accumulated final response is
   * still returned. Implementations without streaming may ignore `onDelta`.
   */
  chat(
    messages: ChatMsg[],
    tools: ToolSpec[],
    onDelta?: (delta: string) => void,
  ): Promise<LlmResponse>;
}

/** Parse a tool-call arguments JSON string, tolerating malformed output. */
function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

/**
 * Provider-agnostic LLM client over the OpenAI-compatible chat-completions +
 * tool-calling shape (§9.1). Works against Mistral or OpenRouter by base URL.
 */
export class LlmClient implements Llm {
  private client: OpenAI;
  private model: string;
  /**
   * Whether to emit Anthropic-style prompt-cache breakpoints (#56b cost). Only
   * OpenRouter passes `cache_control` through to the upstream provider; the
   * Mistral default ignores/​rejects it, so we gate on the base URL to keep that
   * path byte-identical.
   */
  private readonly cacheable: boolean;

  /**
   * `modelOverride` swaps the model for this instance only (#54 "Jiným
   * modelem"): the regenerate route builds a one-off client with a player-chosen
   * model while the base URL / key stay the configured ones.
   */
  constructor(config: Config, modelOverride?: string) {
    this.client = new OpenAI({ apiKey: config.llm.apiKey || "missing", baseURL: config.llm.baseUrl });
    this.model = modelOverride?.trim() || config.llm.model;
    this.cacheable = /openrouter\.ai/i.test(config.llm.baseUrl);
  }

  async chat(
    messages: ChatMsg[],
    tools: ToolSpec[],
    onDelta?: (delta: string) => void,
  ): Promise<LlmResponse> {
    if (onDelta) return this.chatStream(messages, tools, onDelta);

    const resp = await this.client.chat.completions.create({
      model: this.model,
      messages: (this.cacheable ? withCacheBreakpoints(messages) : messages) as never,
      tools: tools as never,
      tool_choice: "auto",
      temperature: 0.7,
    });
    const choice = resp.choices[0]?.message;
    const toolCalls = (choice?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: parseArgs(tc.function.arguments),
    }));
    return { content: choice?.content ?? null, toolCalls, usage: mapUsage(resp.usage) };
  }

  /**
   * Streaming variant (#32): emits each content token through `onDelta` and
   * accumulates the tool-call deltas (which arrive in fragments, keyed by
   * index) into whole calls. The completed response matches the non-streaming
   * shape so the turn loop is agnostic to which path ran.
   */
  private async chatStream(
    messages: ChatMsg[],
    tools: ToolSpec[],
    onDelta: (delta: string) => void,
  ): Promise<LlmResponse> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: (this.cacheable ? withCacheBreakpoints(messages) : messages) as never,
      tools: tools as never,
      tool_choice: "auto",
      temperature: 0.7,
      stream: true,
      // Ask for a final usage chunk so streamed turns can be metered (#56b).
      stream_options: { include_usage: true },
    });

    let content = "";
    let usage: TokenUsage | undefined;
    const acc: Record<number, { id: string; name: string; args: string }> = {};
    for await (const chunk of stream) {
      if (chunk.usage) usage = mapUsage(chunk.usage);
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        onDelta(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const slot = (acc[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name = tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
    }

    const toolCalls = Object.values(acc).map((t) => ({
      id: t.id,
      name: t.name,
      args: parseArgs(t.args),
    }));
    return { content: content || null, toolCalls, usage };
  }
}

/**
 * Add Anthropic-style prompt-cache breakpoints (#56b cost). The turn loop
 * resends the whole context on every one of up to MAX_TOOL_ROUNDS rounds, so
 * the dominant cost is that repeated prefix. Two `cache_control` breakpoints
 * (max 4 for Anthropic) cover it:
 *
 *   1. the system prompt — large and byte-identical on every call;
 *   2. a rolling breakpoint on the final message — caches the entire request
 *      prefix, so the next round (which shares that prefix verbatim) reads it at
 *      ~0.1x instead of paying full input price again.
 *
 * OpenRouter forwards `cache_control` to Anthropic/Gemini; DeepSeek caches
 * automatically and ignores it. Messages are shallow-cloned so the caller's
 * array is untouched; only string content is wrapped (null-content assistant
 * tool-call turns are skipped).
 */
function withCacheBreakpoints(messages: ChatMsg[]): ChatMsg[] {
  const out = messages.map((m) => ({ ...m }));
  const mark = (m: ChatMsg): boolean => {
    if (typeof m.content !== "string" || m.content.length === 0) return false;
    (m as { content: unknown }).content = [
      { type: "text", text: m.content, cache_control: { type: "ephemeral" } },
    ];
    return true;
  };
  const sys = out.find((m) => m.role === "system");
  if (sys) mark(sys);
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] !== sys && mark(out[i]!)) break;
  }
  return out;
}

/** Map an OpenAI-shaped usage object to our minimal {@link TokenUsage}. */
function mapUsage(u: { prompt_tokens?: number; completion_tokens?: number } | undefined): TokenUsage | undefined {
  if (!u) return undefined;
  return { promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0 };
}
