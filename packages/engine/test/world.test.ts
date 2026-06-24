import { describe, expect, it } from "vitest";
import type { FactionRuntime } from "@adm/schemas";
import { dispatch } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

function seed(state: ReturnType<typeof makeState>, factions: FactionRuntime[]) {
  for (const f of factions) state.session.factions[f.id] = f;
}

const guild = (over: Partial<FactionRuntime> & { id: string; name: string }): FactionRuntime => ({
  resources: "medium",
  relationships: {},
  progress: 0.3,
  ...over,
});

describe("living world (#49)", () => {
  it("advances a faction toward its goal and logs the shift", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    seed(state, [guild({ id: "kult", name: "Kult", progress: 0.3 })]);
    const r = dispatch(state, "faction_advance", { id: "kult", delta: 0.2, reason: "obřad" });
    expect(r.ok).toBe(true);
    expect(state.session.factions["kult"]?.progress).toBeCloseTo(0.5);
    expect(state.session.log.some((l) => l.kind === "world" && l.tool === "faction_advance")).toBe(true);
  });

  it("clamps faction progress to [0,1]", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    seed(state, [guild({ id: "kult", name: "Kult", progress: 0.9 })]);
    dispatch(state, "faction_advance", { id: "kult", delta: 0.5 });
    expect(state.session.factions["kult"]?.progress).toBe(1);
    dispatch(state, "faction_advance", { id: "kult", delta: -1 });
    expect(state.session.factions["kult"]?.progress).toBe(0);
  });

  it("rejects advancing an unknown faction", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    const r = dispatch(state, "faction_advance", { id: "nope", delta: 0.1 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Neznámá frakce/i);
  });

  it("sets a symmetric relationship between two factions", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    seed(state, [guild({ id: "cech", name: "Cech" }), guild({ id: "kult", name: "Kult" })]);
    const r = dispatch(state, "faction_relation", { a: "cech", b: "kult", stance: "hostile" });
    expect(r.ok).toBe(true);
    expect(state.session.factions["cech"]?.relationships["kult"]).toBe("hostile");
    expect(state.session.factions["kult"]?.relationships["cech"]).toBe("hostile");
  });

  it("sets a location danger override and logs it", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    const r = dispatch(state, "location_danger", { id: "ricni-brod", level: "high" });
    expect(r.ok).toBe(true);
    expect(state.session.location_danger["ricni-brod"]).toBe("high");
  });

  it("triggers a world event once and applies structured consequences", () => {
    const state = makeState([makeActor({ id: "h", name: "Hrdina" })]);
    seed(state, [guild({ id: "cech", name: "Cech", progress: 0.5, resources: "high" })]);
    const r = dispatch(state, "world_event_trigger", {
      id: "cesty-zkolabovaly",
      name: "Zkolabovaly obchodní cesty",
      consequences: ["location.ricni-brod.danger: high", "faction.cech.progress: -0.2", "faction.cech.resources: low"],
    });
    expect(r.ok).toBe(true);
    expect(state.session.world_events["cesty-zkolabovaly"]?.triggered).toBe(true);
    expect(state.session.location_danger["ricni-brod"]).toBe("high");
    expect(state.session.factions["cech"]?.progress).toBeCloseTo(0.3);
    expect(state.session.factions["cech"]?.resources).toBe("low");
    // Idempotent: a second trigger is refused.
    expect(dispatch(state, "world_event_trigger", { id: "cesty-zkolabovaly" }).ok).toBe(false);
  });
});
