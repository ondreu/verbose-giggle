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

export interface LlmResponse {
  content: string | null;
  toolCalls: { id: string; name: string; args: unknown }[];
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
   * `modelOverride` swaps the model for this instance only (#54 "Jiným
   * modelem"): the regenerate route builds a one-off client with a player-chosen
   * model while the base URL / key stay the configured ones.
   */
  constructor(config: Config, modelOverride?: string) {
    this.client = new OpenAI({ apiKey: config.llm.apiKey || "missing", baseURL: config.llm.baseUrl });
    this.model = modelOverride?.trim() || config.llm.model;
  }

  async chat(
    messages: ChatMsg[],
    tools: ToolSpec[],
    onDelta?: (delta: string) => void,
  ): Promise<LlmResponse> {
    if (onDelta) return this.chatStream(messages, tools, onDelta);

    const resp = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as never,
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
    return { content: choice?.content ?? null, toolCalls };
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
      messages: messages as never,
      tools: tools as never,
      tool_choice: "auto",
      temperature: 0.7,
      stream: true,
    });

    let content = "";
    const acc: Record<number, { id: string; name: string; args: string }> = {};
    for await (const chunk of stream) {
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
    return { content: content || null, toolCalls };
  }
}
