import { describe, expect, it } from "vitest";
import { openInMemoryDatabase } from "../src/db/database.js";
import { UserStore } from "../src/auth/users.js";
import { CreditStore } from "../src/credits/ledger.js";
import { MeteredLlm, creditsForUsage, type CreditPricing } from "../src/credits/metering.js";
import type { Llm, LlmResponse } from "../src/llm/client.js";

function setup() {
  const db = openInMemoryDatabase();
  const users = new UserStore(db);
  const credits = new CreditStore(db);
  const user = users.create({ email: "a@b.c", passwordHash: "h" });
  return { db, users, credits, user };
}

describe("credit ledger (#56a)", () => {
  it("starts at zero", () => {
    const { credits, user } = setup();
    expect(credits.balance(user.id)).toBe(0);
    expect(credits.balance("nobody")).toBe(0);
  });

  it("grants and charges, deriving balance from the sum", () => {
    const { credits, user } = setup();
    credits.grant(user.id, 1000, "admin-grant");
    credits.charge(user.id, 250, "llm-turn", "turn-1");
    credits.charge(user.id, 50, "tts");
    expect(credits.balance(user.id)).toBe(700);
  });

  it("can go negative if overcharged (enforcement is a separate layer)", () => {
    const { credits, user } = setup();
    credits.grant(user.id, 100, "grant");
    credits.charge(user.id, 150, "usage");
    expect(credits.balance(user.id)).toBe(-50);
  });

  it("rejects non-positive grants/charges and non-integer deltas", () => {
    const { credits, user } = setup();
    expect(() => credits.grant(user.id, 0, "x")).toThrow();
    expect(() => credits.charge(user.id, -5, "x")).toThrow();
    expect(() => credits.grant(user.id, 1.5, "x")).toThrow();
  });

  it("returns history newest first", () => {
    const { credits, user } = setup();
    credits.grant(user.id, 100, "first");
    credits.charge(user.id, 10, "second");
    const hist = credits.history(user.id);
    expect(hist).toHaveLength(2);
    expect(hist[0]!.reason).toBe("second");
    expect(hist[0]!.delta).toBe(-10);
    expect(hist[1]!.reason).toBe("first");
  });

  it("cascade-deletes ledger rows when the user is removed", () => {
    const { credits, users, user } = setup();
    credits.grant(user.id, 100, "grant");
    users.delete(user.id);
    expect(credits.balance(user.id)).toBe(0);
    expect(credits.history(user.id)).toHaveLength(0);
  });
});

const PRICING: CreditPricing = { perThousandPromptTokens: 1, perThousandCompletionTokens: 3 };

describe("metering (#56b)", () => {
  it("costs usage at price × markup, rounding up", () => {
    expect(creditsForUsage(PRICING, { promptTokens: 1000, completionTokens: 1000 })).toBe(4);
    // 500 prompt → 0.5, 100 completion → 0.3 → ceil(0.8) = 1
    expect(creditsForUsage(PRICING, { promptTokens: 500, completionTokens: 100 })).toBe(1);
    expect(creditsForUsage(PRICING, { promptTokens: 0, completionTokens: 0 })).toBe(0);
  });

  it("MeteredLlm accumulates usage across calls and forwards the response", async () => {
    const responses: LlmResponse[] = [
      { content: "a", toolCalls: [], usage: { promptTokens: 1000, completionTokens: 500 } },
      { content: "b", toolCalls: [], usage: { promptTokens: 2000, completionTokens: 0 } },
      { content: "c", toolCalls: [] }, // no usage reported — ignored
    ];
    let i = 0;
    const inner: Llm = { chat: async () => responses[i++]! };
    const metered = new MeteredLlm(inner);

    for (let n = 0; n < 3; n++) await metered.chat([], []);
    expect(metered.usage).toEqual({ promptTokens: 3000, completionTokens: 500 });
    // 3000 prompt → 3, 500 completion → 1.5 → ceil(4.5) = 5
    expect(metered.cost(PRICING)).toBe(5);
  });
});
