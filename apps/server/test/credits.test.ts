import { describe, expect, it } from "vitest";
import { openInMemoryDatabase } from "../src/db/database.js";
import { UserStore } from "../src/auth/users.js";
import { CreditStore } from "../src/credits/ledger.js";

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
