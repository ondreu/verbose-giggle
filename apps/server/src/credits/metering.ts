/**
 * Token metering (#56b). Converts provider-reported token usage into a credit
 * cost (provider cost × markup), and wraps a narrator so a whole turn's usage
 * — which spans several `chat` rounds in the tool loop — accumulates in one
 * place. The actual charge happens in the route *after* the turn succeeds, so a
 * failed turn is never billed (determinism note #12: charging is a side effect
 * outside the engine).
 */
import type { Llm, ChatMsg, LlmResponse, TokenUsage, ToolSpec } from "../llm/client.js";

export interface CreditPricing {
  /** Credits charged per 1000 prompt (input) tokens, after markup. */
  perThousandPromptTokens: number;
  /** Credits charged per 1000 completion (output) tokens, after markup. */
  perThousandCompletionTokens: number;
  /** Credits charged per generated image, after markup. */
  perImage: number;
  /** Credits charged per 1000 characters of synthesized speech, after markup. */
  perThousandTtsChars: number;
}

/** Integer credit cost for a token total at the given pricing (rounds up). */
export function creditsForUsage(pricing: CreditPricing, usage: TokenUsage): number {
  const cost =
    (usage.promptTokens / 1000) * pricing.perThousandPromptTokens +
    (usage.completionTokens / 1000) * pricing.perThousandCompletionTokens;
  return Math.ceil(cost);
}

/**
 * Narrator decorator that records token usage from every `chat` call it
 * forwards. Streaming and tool-call behaviour are unchanged — it only observes.
 */
export class MeteredLlm implements Llm {
  readonly usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };

  constructor(private readonly inner: Llm) {}

  async chat(messages: ChatMsg[], tools: ToolSpec[], onDelta?: (d: string) => void): Promise<LlmResponse> {
    const resp = await this.inner.chat(messages, tools, onDelta);
    if (resp.usage) {
      this.usage.promptTokens += resp.usage.promptTokens;
      this.usage.completionTokens += resp.usage.completionTokens;
    }
    return resp;
  }

  /** Total credit cost of everything metered so far. */
  cost(pricing: CreditPricing): number {
    return creditsForUsage(pricing, this.usage);
  }
}
