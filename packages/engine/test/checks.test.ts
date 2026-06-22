import { describe, expect, it } from "vitest";
import { abilityCheck, dispatch, nextTurn, savingThrow, startCombat } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

describe("ability checks & saves", () => {
  it("adds proficiency for a proficient skill", () => {
    const a = makeActor({ id: "a", name: "A", abilities: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, proficiency_bonus: 2, proficiencies: { saves: [], skills: ["athletics"], weapons: [], armor: [] } });
    const state = makeState([a], "chk");
    const r = abilityCheck(state, { actor: "a", ability: "str", skill: "athletics", dc: 10 });
    // STR mod +3, prof +2 → modifier 5.
    expect(r.modifier).toBe(5);
    expect(r.detail).toContain("(prof)");
  });

  it("proficient save adds proficiency, success compares to DC", () => {
    const a = makeActor({ id: "a", name: "A", proficiency_bonus: 2, proficiencies: { saves: ["con"], skills: [], weapons: [], armor: [] }, abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 } });
    const state = makeState([a], "save");
    const r = savingThrow(state, { actor: "a", ability: "con", dc: 10 });
    expect(r.modifier).toBe(4); // +2 con, +2 prof
    expect(r.success).toBe(r.total >= 10);
  });
});

describe("turn order", () => {
  it("advances and wraps to a new round", () => {
    const a = makeActor({ id: "a", name: "A", abilities: { str: 10, dex: 20, con: 10, int: 10, wis: 10, cha: 10 } });
    const b = makeActor({ id: "b", name: "B", abilities: { str: 10, dex: 8, con: 10, int: 10, wis: 10, cha: 10 } });
    const state = makeState([a, b], "init");
    const start = startCombat(state, { participants: ["a", "b"] });
    expect(start.order.length).toBe(2);
    const firstActor = state.session.active_player;
    nextTurn(state);
    nextTurn(state);
    expect(state.session.combat?.round).toBe(2);
    expect(state.session.active_player).toBe(firstActor);
  });
});

describe("dispatch validation", () => {
  it("rejects unknown tools", () => {
    const state = makeState([makeActor({ id: "a", name: "A" })]);
    expect(dispatch(state, "nope", {}).ok).toBe(false);
  });

  it("rejects invalid args via zod", () => {
    const state = makeState([makeActor({ id: "a", name: "A" })]);
    const r = dispatch(state, "ability_check", { actor: "a" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Invalid args");
  });

  it("runs a valid read-only tool", () => {
    const state = makeState([makeActor({ id: "a", name: "A" })]);
    const r = dispatch(state, "get_state", {});
    expect(r.ok).toBe(true);
  });
});
