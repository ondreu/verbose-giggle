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
  chat(messages: ChatMsg[], tools: ToolSpec[]): Promise<LlmResponse>;
}

/**
 * Provider-agnostic LLM client over the OpenAI-compatible chat-completions +
 * tool-calling shape (§9.1). Works against Mistral or OpenRouter by base URL.
 */
export class LlmClient implements Llm {
  private client: OpenAI;
  private model: string;

  constructor(config: Config) {
    this.client = new OpenAI({ apiKey: config.llm.apiKey || "missing", baseURL: config.llm.baseUrl });
    this.model = config.llm.model;
  }

  async chat(messages: ChatMsg[], tools: ToolSpec[]): Promise<LlmResponse> {
    const resp = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as never,
      tools: tools as never,
      tool_choice: "auto",
      temperature: 0.7,
    });
    const choice = resp.choices[0]?.message;
    const toolCalls = (choice?.tool_calls ?? []).map((tc) => {
      let args: unknown = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }
      return { id: tc.id, name: tc.function.name, args };
    });
    return { content: choice?.content ?? null, toolCalls };
  }
}
