import { describe, expect, it } from "vitest";
import { makeRng, parseDice, roll, rollD20 } from "../src/index.js";

describe("dice parser", () => {
  it("parses compound expressions", () => {
    expect(parseDice("2d6+3")).toEqual([
      { sign: 1, count: 2, sides: 6 },
      { sign: 1, constant: 3 },
    ]);
  });

  it("parses bare dN as 1dN and handles subtraction", () => {
    expect(parseDice("d20-1")).toEqual([
      { sign: 1, count: 1, sides: 20 },
      { sign: -1, constant: 1 },
    ]);
  });

  it("rejects garbage", () => {
    expect(() => parseDice("hello")).toThrow();
    expect(() => parseDice("2dd6")).toThrow();
  });
});

describe("seeded rolls are deterministic", () => {
  it("same seed → same result", () => {
    const a = roll("3d6+2", makeRng("abc"));
    const b = roll("3d6+2", makeRng("abc"));
    expect(a.total).toBe(b.total);
    expect(a.groups).toEqual(b.groups);
  });

  it("respects bounds", () => {
    const rng = makeRng("bounds");
    for (let i = 0; i < 500; i++) {
      const r = roll("1d6", rng);
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.total).toBeLessThanOrEqual(6);
    }
  });
});

describe("rollD20 advantage", () => {
  it("advantage takes the higher of two", () => {
    const r = rollD20(makeRng("adv"), 5, "advantage");
    expect(r.rolls.length).toBe(2);
    expect(r.natural).toBe(Math.max(...r.rolls));
    expect(r.total).toBe(r.natural + 5);
  });

  it("disadvantage takes the lower of two", () => {
    const r = rollD20(makeRng("dis"), 0, "disadvantage");
    expect(r.natural).toBe(Math.min(...r.rolls));
  });
});
