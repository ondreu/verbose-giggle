import { describe, expect, it } from "vitest";
import { attackMods, checkMods, combineAdv, saveMods, savingThrow, move, startCombat } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

describe("combineAdv", () => {
  it("cancels advantage and disadvantage", () => {
    expect(combineAdv(["advantage", "disadvantage"])).toBe("none");
    expect(combineAdv(["advantage", "none"])).toBe("advantage");
    expect(combineAdv(["disadvantage"])).toBe("disadvantage");
  });
});

describe("attack modifiers from conditions", () => {
  const atk = makeActor({ id: "a", name: "A" });
  it("gives advantage vs a prone target in melee, disadvantage at range", () => {
    const prone = makeActor({ id: "t", name: "T", conditions: [{ name: "prone", duration: null }] });
    expect(attackMods(atk, prone, { ranged: false, adjacent: true }).advantage).toBe("advantage");
    expect(attackMods(atk, prone, { ranged: true, adjacent: false }).advantage).toBe("disadvantage");
  });
  it("auto-crits an adjacent unconscious target", () => {
    const ko = makeActor({ id: "t", name: "T", conditions: [{ name: "unconscious", duration: null }] });
    expect(attackMods(atk, ko, { ranged: false, adjacent: true }).autoCrit).toBe(true);
  });
  it("blocks an incapacitated attacker", () => {
    const stunned = makeActor({ id: "s", name: "S", conditions: [{ name: "stunned", duration: null }] });
    expect(attackMods(stunned, atk, { ranged: false, adjacent: true }).blocked).toBe(true);
  });
});

describe("save & check modifiers", () => {
  it("auto-fails STR/DEX saves while paralyzed", () => {
    const p = makeActor({ id: "p", name: "P", conditions: [{ name: "paralyzed", duration: null }] });
    const state = makeState([p], "save");
    const r = savingThrow(state, { actor: "p", ability: "dex", dc: 5 });
    expect(r.success).toBe(false);
    expect(r.detail).toContain("automatický");
  });
  it("poisoned gives disadvantage on ability checks", () => {
    const a = makeActor({ id: "a", name: "A", conditions: [{ name: "poisoned", duration: null }] });
    expect(checkMods(a).advantage).toBe("disadvantage");
  });
  it("restrained gives disadvantage on DEX saves only", () => {
    const a = makeActor({ id: "a", name: "A", conditions: [{ name: "restrained", duration: null }] });
    expect(saveMods(a, "dex").advantage).toBe("disadvantage");
    expect(saveMods(a, "wis").advantage).toBe("none");
  });
});

describe("movement is blocked by grappled/restrained", () => {
  it("a grappled actor cannot move", () => {
    const a = makeActor({ id: "a", name: "A", speed: 30, position: { x: 0, y: 0 }, conditions: [{ name: "grappled", duration: null }] });
    const state = makeState([a]);
    startCombat(state, { participants: ["a"], grid: { w: 10, h: 10, cell_ft: 5 } });
    const r = move(state, { actor: "a", to: { x: 1, y: 0 } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("cannot move");
  });
});
