import { describe, expect, it } from "vitest";
import { nextTurn, startCombat } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

describe("nextTurn turn-end visibility (#3)", () => {
  it("logs the turn that ended and who is up next", () => {
    const a = makeActor({ id: "a", name: "Asa", faction: "party", abilities: { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 } } as never);
    const g = makeActor({ id: "g", name: "Goblin", faction: "hostile", abilities: { str: 10, dex: 8, con: 10, int: 10, wis: 10, cha: 10 } } as never);
    const state = makeState([a, g], "turn-end");
    const { order } = startCombat(state, { participants: ["a", "g"], grid: { w: 10, h: 10, cell_ft: 5 } });
    const firstName = state.actors[order[0]!.actor]!.name;
    const secondName = state.actors[order[1]!.actor]!.name;
    // Advancing ends the first actor's turn and names the next one.
    nextTurn(state);
    const turnLog = state.session.log.filter((l) => l.kind === "turn").at(-1)!;
    expect(turnLog.detail).toContain(`Tah ${firstName} končí`);
    expect(turnLog.detail).toContain(`na tahu ${secondName}`);
  });
});

describe("startCombat token placement", () => {
  it("auto-places every participant when no positions are given", () => {
    const a = makeActor({ id: "a", name: "A", faction: "party" });
    const b = makeActor({ id: "b", name: "B", faction: "party" });
    const g = makeActor({ id: "g", name: "G", faction: "hostile" });
    const state = makeState([a, b, g], "place-1");

    startCombat(state, { participants: ["a", "b", "g"], grid: { w: 12, h: 10, cell_ft: 5 } });
    const tokens = state.session.combat!.tokens;

    // Every combatant has a token, and tokens never overlap.
    expect(Object.keys(tokens).sort()).toEqual(["a", "b", "g"]);
    const cells = Object.values(tokens).map((p) => `${p.x},${p.y}`);
    expect(new Set(cells).size).toBe(cells.length);

    // Friendly on the left edge, hostile on the right edge (fallback placement).
    expect(tokens.a!.x).toBe(0);
    expect(tokens.b!.x).toBe(0);
    expect(tokens.g!.x).toBe(11);
  });

  it("respects explicit positions and only fills the gaps", () => {
    const a = makeActor({ id: "a", name: "A", faction: "party" });
    const g = makeActor({ id: "g", name: "G", faction: "hostile" });
    const state = makeState([a, g], "place-2");

    startCombat(state, {
      participants: ["a", "g"],
      grid: { w: 8, h: 8, cell_ft: 5 },
      positions: { a: { x: 3, y: 4 } },
    });
    const tokens = state.session.combat!.tokens;
    expect(tokens.a).toEqual({ x: 3, y: 4 });
    expect(tokens.g).toBeDefined();
  });
});
