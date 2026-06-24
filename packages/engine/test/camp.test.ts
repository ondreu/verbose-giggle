import { describe, expect, it } from "vitest";
import { recallFromCamp, sendToCamp } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

describe("camp roster management", () => {
  it("sends a party member to camp and recalls them", () => {
    const a = makeActor({ id: "a", name: "Aria" });
    const b = makeActor({ id: "b", name: "Borin" });
    const state = makeState([a, b]);

    const sent = sendToCamp(state, { actor: "b" });
    expect(sent).toEqual({ camp: ["b"] });
    expect(state.session.camp).toEqual(["b"]);

    const back = recallFromCamp(state, { actor: "b" });
    expect(back).toEqual({ camp: [] });
    expect(state.session.camp).toEqual([]);
  });

  it("hands hotseat control to another awake member when the active one camps", () => {
    const a = makeActor({ id: "a", name: "Aria" });
    const b = makeActor({ id: "b", name: "Borin" });
    const state = makeState([a, b]);
    state.session.active_player = "a";

    sendToCamp(state, { actor: "a" });
    expect(state.session.active_player).toBe("b");
  });

  it("refuses to camp the last awake party member", () => {
    const a = makeActor({ id: "a", name: "Aria" });
    const state = makeState([a]);
    const r = sendToCamp(state, { actor: "a" });
    expect(r).toHaveProperty("error");
    expect(state.session.camp ?? []).toEqual([]);
  });

  it("refuses to camp during combat", () => {
    const a = makeActor({ id: "a", name: "Aria" });
    const b = makeActor({ id: "b", name: "Borin" });
    const state = makeState([a, b]);
    state.session.combat = {
      round: 1,
      order: [{ actor: "a", initiative: 10 }],
      turn_index: 0,
      grid: { w: 5, h: 5, cell_ft: 5, shape: "square" },
      tokens: {},
      terrain: [],
    };
    const r = sendToCamp(state, { actor: "b" });
    expect(r).toHaveProperty("error");
  });

  it("refuses to camp a non-party actor", () => {
    const a = makeActor({ id: "a", name: "Aria" });
    const goblin = makeActor({ id: "g", name: "Goblin", faction: "hostile", controller: "ai" });
    const state = makeState([a, goblin]);
    const r = sendToCamp(state, { actor: "g" });
    expect(r).toHaveProperty("error");
  });
});
