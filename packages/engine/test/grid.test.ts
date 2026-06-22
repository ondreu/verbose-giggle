import { describe, expect, it } from "vitest";
import { aoe, distanceFt, move, reachableCells, startCombat } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

describe("distance (5-5-5)", () => {
  it("diagonal counts as one cell", () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 3, y: 3 }, 5, "5-5-5")).toBe(15);
  });
  it("straight line", () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 0, y: 4 }, 5, "5-5-5")).toBe(20);
  });
  it("5-10-5 doubles every second diagonal", () => {
    // 4 diagonals: costs 1+2+1+2 = 6 cells = 30ft.
    expect(distanceFt({ x: 0, y: 0 }, { x: 4, y: 4 }, 5, "5-10-5")).toBe(30);
  });
});

describe("move", () => {
  it("rejects moves beyond the movement budget", () => {
    const a = makeActor({ id: "a", name: "Mover", speed: 30, position: { x: 0, y: 0 } });
    const state = makeState([a]);
    startCombat(state, { participants: ["a"], grid: { w: 20, h: 20, cell_ft: 5 } });
    // 30ft budget = 6 cells. (10,0) is 50ft away → unreachable.
    const r = move(state, { actor: "a", to: { x: 10, y: 0 } });
    expect(r.ok).toBe(false);
  });

  it("allows a move within budget and decrements remaining", () => {
    const a = makeActor({ id: "a", name: "Mover", speed: 30, position: { x: 0, y: 0 } });
    const state = makeState([a]);
    startCombat(state, { participants: ["a"], grid: { w: 20, h: 20, cell_ft: 5 } });
    const r = move(state, { actor: "a", to: { x: 3, y: 0 } });
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(15);
    expect(r.remaining).toBe(15);
    expect(state.session.combat?.tokens["a"]).toEqual({ x: 3, y: 0 });
  });

  it("routes around blocking tokens", () => {
    const a = makeActor({ id: "a", name: "A", speed: 60, position: { x: 0, y: 0 } });
    const b = makeActor({ id: "b", name: "B", position: { x: 1, y: 0 } });
    const state = makeState([a, b]);
    startCombat(state, { participants: ["a", "b"], grid: { w: 20, h: 20, cell_ft: 5 } });
    const r = move(state, { actor: "a", to: { x: 2, y: 0 } });
    expect(r.ok).toBe(true);
    // Should not land on b's cell.
    expect(state.session.combat?.tokens["a"]).toEqual({ x: 2, y: 0 });
  });
});

describe("reachableCells", () => {
  it("includes cells within the movement budget and excludes far ones", () => {
    const a = makeActor({ id: "a", name: "Mover", speed: 30, position: { x: 5, y: 5 } });
    const state = makeState([a]);
    startCombat(state, { participants: ["a"], grid: { w: 20, h: 20, cell_ft: 5 } });
    const { cells, budget } = reachableCells(state, { actor: "a" });
    expect(budget).toBe(30);
    const has = (x: number, y: number) => cells.some((c) => c.x === x && c.y === y);
    expect(has(6, 5)).toBe(true); // 5ft away
    expect(has(11, 5)).toBe(true); // 6 cells = 30ft, exactly within budget
    expect(has(12, 5)).toBe(false); // 35ft — out of budget
  });
});

describe("aoe", () => {
  it("sphere covers a Chebyshev disc and catches tokens inside", () => {
    const a = makeActor({ id: "a", name: "A", position: { x: 5, y: 5 } });
    const b = makeActor({ id: "b", name: "B", position: { x: 6, y: 5 } });
    const c = makeActor({ id: "c", name: "C", position: { x: 15, y: 15 } });
    const state = makeState([a, b, c]);
    startCombat(state, { participants: ["a", "b", "c"], grid: { w: 20, h: 20, cell_ft: 5 } });
    const r = aoe(state, { shape: "sphere", origin: { x: 5, y: 5 }, size: 10 });
    expect(r.tokens).toContain("a");
    expect(r.tokens).toContain("b");
    expect(r.tokens).not.toContain("c");
  });
});
