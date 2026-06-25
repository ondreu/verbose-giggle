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
  /**
   * Per-action billing (#56f). The player is charged a flat price per message
   * (one LLM narration turn), keyed by the model that ran, with `perMessage` as
   * the fallback when a model has no explicit rate. Predictable for players;
   * per-model so a pricey model (Opus) can cost more than a cheap one (Haiku).
   */
  perMessage: number;
  /** Per-model message-price overrides: model id → credits per message. */
  perModelMessage: Record<string, number>;
  /** Flat credits per campaign generation (the forge, #46). */
  perCampaign: number;
  /** Credits charged per generated image, after markup. */
  perImage: number;
  /** Credits charged per 1000 characters of synthesized speech, after markup. */
  perThousandTtsChars: number;
  /**
   * Token rates, kept underneath as a **cost basis** (logged per turn) so the
   * operator can sanity-check that the per-message price covers real token cost.
   * No longer the primary charge for LLM turns.
   */
  perThousandPromptTokens: number;
  perThousandCompletionTokens: number;
}

/** Flat per-message credit price for a model (its override, else the default). */
export function creditsPerMessage(pricing: CreditPricing, model: string | undefined): number {
  const rate = model != null ? pricing.perModelMessage[model] : undefined;
  return Math.ceil(rate ?? pricing.perMessage);
}

/** Token cost basis for a turn at the given pricing (rounds up). For logging. */
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
