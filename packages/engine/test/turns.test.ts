import { describe, expect, it } from "vitest";
import { startCombat } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

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

    // Friendly on the left edge, hostile starts 6 cells (30 ft) away.
    expect(tokens.a!.x).toBe(0);
    expect(tokens.b!.x).toBe(0);
    expect(tokens.g!.x).toBe(6);
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
