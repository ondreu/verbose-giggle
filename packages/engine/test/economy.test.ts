import { describe, expect, it } from "vitest";
import { dispatch, spendEconomy, startCombat } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

function combatOf(state: ReturnType<typeof makeState>) {
  const c = state.session.combat;
  if (!c) throw new Error("no combat");
  return c;
}

describe("action economy enforcement", () => {
  it("allows one action then refuses a second in the same turn", () => {
    const a = makeActor({ id: "a", name: "A" });
    const b = makeActor({ id: "b", name: "B", faction: "hostile" });
    const state = makeState([a, b], "econ-1");
    startCombat(state, { participants: ["a", "b"] });
    const active = combatOf(state).order[0]!.actor;
    const other = active === "a" ? "b" : "a";

    const first = dispatch(state, "attack", { attacker: active, target: other });
    expect(first.ok).toBe(true);

    const second = dispatch(state, "attack", { attacker: active, target: other });
    expect(second.ok).toBe(false);
    expect(second.error).toContain("akci");
    // Refusal is recorded on the visible log.
    expect(state.session.log.some((l) => l.kind === "economy")).toBe(true);
  });

  it("refreshes the action budget on next_turn", () => {
    const a = makeActor({ id: "a", name: "A" });
    const b = makeActor({ id: "b", name: "B", faction: "hostile" });
    const state = makeState([a, b], "econ-2");
    startCombat(state, { participants: ["a", "b"] });
    const order = combatOf(state).order.map((o) => o.actor);
    const active = order[0]!;
    const other = active === "a" ? "b" : "a";

    expect(dispatch(state, "attack", { attacker: active, target: other }).ok).toBe(true);
    expect(dispatch(state, "attack", { attacker: active, target: other }).ok).toBe(false);

    // Advance to the next actor — it gets a fresh action.
    dispatch(state, "next_turn", {});
    const nowActive = combatOf(state).order[combatOf(state).turn_index]!.actor;
    const nowTarget = nowActive === "a" ? "b" : "a";
    expect(dispatch(state, "attack", { attacker: nowActive, target: nowTarget }).ok).toBe(true);
  });

  it("treats an off-turn attack as a reaction, spent once", () => {
    const a = makeActor({ id: "a", name: "A" });
    const b = makeActor({ id: "b", name: "B", faction: "hostile" });
    const state = makeState([a, b], "econ-3");
    startCombat(state, { participants: ["a", "b"] });
    const active = combatOf(state).order[0]!.actor;
    const reactor = active === "a" ? "b" : "a";

    // The non-active creature reacts (opportunity attack) — allowed once.
    expect(dispatch(state, "attack", { attacker: reactor, target: active }).ok).toBe(true);
    expect(combatOf(state).budget?.reaction).toBe(false);
    // A second off-turn attack is refused — no reaction left.
    const again = dispatch(state, "attack", { attacker: reactor, target: active });
    expect(again.ok).toBe(false);
    expect(again.error).toContain("reakci");
  });
});

describe("spendEconomy budget categories", () => {
  it("tracks action and bonus independently", () => {
    const a = makeActor({ id: "a", name: "A" });
    const b = makeActor({ id: "b", name: "B", faction: "hostile" });
    const state = makeState([a, b], "econ-4");
    startCombat(state, { participants: ["a", "b"] });
    const active = combatOf(state).order[0]!.actor;

    expect(spendEconomy(state, active, "bonus").ok).toBe(true);
    // Action is still available even though the bonus action was used.
    expect(spendEconomy(state, active, "action").ok).toBe(true);
    // Both are now spent.
    expect(spendEconomy(state, active, "bonus").ok).toBe(false);
    expect(spendEconomy(state, active, "action").ok).toBe(false);
  });

  it("is a no-op outside combat (everything free)", () => {
    const a = makeActor({ id: "a", name: "A" });
    const state = makeState([a], "econ-5");
    expect(spendEconomy(state, "a", "action").ok).toBe(true);
    expect(spendEconomy(state, "a", "action").ok).toBe(true);
  });
});
