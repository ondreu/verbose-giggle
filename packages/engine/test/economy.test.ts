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
    startCombat(state, {
      participants: ["a", "b"],
      grid: { w: 8, h: 8, cell_ft: 5 },
      positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, // adjacent: attacks are in reach
    });
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
    startCombat(state, {
      participants: ["a", "b"],
      grid: { w: 8, h: 8, cell_ft: 5 },
      positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, // adjacent: attacks are in reach
    });
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

  it("opportunity attack (reaction:true) off-turn is allowed once", () => {
    const a = makeActor({ id: "a", name: "A" });
    const b = makeActor({ id: "b", name: "B", faction: "hostile" });
    const state = makeState([a, b], "econ-3");
    startCombat(state, {
      participants: ["a", "b"],
      grid: { w: 8, h: 8, cell_ft: 5 },
      positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, // adjacent: attacks are in reach
    });
    const active = combatOf(state).order[0]!.actor;
    const reactor = active === "a" ? "b" : "a";

    // Off-turn attack without reaction flag is refused (wrong actor on turn).
    const noFlag = dispatch(state, "attack", { attacker: reactor, target: active });
    expect(noFlag.ok).toBe(false);
    expect(noFlag.error).toContain("není na tahu");
    // The refusal names the actor who IS on turn (id), so a hotseat mix-up can
    // self-correct by re-issuing the tool with the active actor's id (#1).
    expect(noFlag.error).toContain(active);

    // With reaction:true it is treated as an opportunity attack — allowed once.
    expect(dispatch(state, "attack", { attacker: reactor, target: active, reaction: true }).ok).toBe(true);
    expect(combatOf(state).budget?.reaction).toBe(false);
    // A second opportunity attack is refused — reaction already spent.
    const again = dispatch(state, "attack", { attacker: reactor, target: active, reaction: true });
    expect(again.ok).toBe(false);
    expect(again.error).toContain("reakci");
  });
});

describe("no-op refusals refund the action (so the turn isn't wasted)", () => {
  it("an out-of-reach attack does not burn the action — move in, then attack", () => {
    const a = makeActor({ id: "a", name: "A", speed: 30 });
    const b = makeActor({ id: "b", name: "B", faction: "hostile", ac: 5, hp: { max: 7, current: 7, temp: 0 } });
    const state = makeState([a, b], "refund-melee");
    startCombat(state, {
      participants: ["a", "b"],
      grid: { w: 12, h: 12, cell_ft: 5 },
      positions: { a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }, // 25 ft apart — out of melee reach
    });
    // Make A the active actor regardless of the initiative roll.
    if (combatOf(state).order[combatOf(state).turn_index]!.actor !== "a") dispatch(state, "next_turn", {});
    expect(combatOf(state).order[combatOf(state).turn_index]!.actor).toBe("a");

    // Attack from out of reach: a no-op refusal that must NOT consume the action.
    const far = dispatch(state, "attack", { attacker: "a", target: "b" });
    expect(far.ok).toBe(true);
    expect((far.result as { noop?: boolean }).noop).toBe(true);
    expect(combatOf(state).budget?.action).toBe(true);

    // Close the distance, then the attack lands within reach — action still available.
    expect(dispatch(state, "move", { actor: "a", to: { x: 4, y: 0 } }).ok).toBe(true);
    const near = dispatch(state, "attack", { attacker: "a", target: "b" });
    expect(near.ok).toBe(true);
    expect((near.result as { noop?: boolean }).noop).toBeUndefined();
    // The genuine attack consumed the action.
    expect(combatOf(state).budget?.action).toBe(false);
  });

  it("a refused spell (unknown / not on the caster's list) does not burn the action", () => {
    const a = makeActor({ id: "a", name: "A" });
    const b = makeActor({ id: "b", name: "B", faction: "hostile" });
    const state = makeState([a, b], "refund-spell");
    startCombat(state, {
      participants: ["a", "b"],
      grid: { w: 8, h: 8, cell_ft: 5 },
      positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
    });
    const active = combatOf(state).order[combatOf(state).turn_index]!.actor;

    const res = dispatch(state, "cast_spell", { caster: active, spell: "no-such-spell", targets: [] });
    expect(res.ok).toBe(true);
    expect((res.result as { error?: string }).error).toBeTruthy();
    // The action is refunded — the caster can still do something this turn.
    expect(combatOf(state).budget?.action).toBe(true);
  });

  it("a friendly-fire refusal does not burn the action", () => {
    const a = makeActor({ id: "a", name: "A" });
    const ally = makeActor({ id: "f", name: "Druh", faction: "ally" });
    const b = makeActor({ id: "b", name: "B", faction: "hostile" });
    const state = makeState([a, ally, b], "refund-ff");
    startCombat(state, {
      participants: ["a", "f", "b"],
      grid: { w: 8, h: 8, cell_ft: 5 },
      positions: { a: { x: 0, y: 0 }, f: { x: 1, y: 0 }, b: { x: 2, y: 0 } },
    });
    if (combatOf(state).order[combatOf(state).turn_index]!.actor !== "a") {
      // Walk the pointer to A so the friendly-fire attempt is on its own turn.
      for (let i = 0; i < 3 && combatOf(state).order[combatOf(state).turn_index]!.actor !== "a"; i++) {
        dispatch(state, "next_turn", {});
      }
    }
    expect(combatOf(state).order[combatOf(state).turn_index]!.actor).toBe("a");

    const ff = dispatch(state, "attack", { attacker: "a", target: "f" });
    expect(ff.ok).toBe(true);
    expect((ff.result as { noop?: boolean }).noop).toBe(true);
    expect(combatOf(state).budget?.action).toBe(true);
  });
});

describe("spendEconomy budget categories", () => {
  it("tracks action and bonus independently", () => {
    const a = makeActor({ id: "a", name: "A" });
    const b = makeActor({ id: "b", name: "B", faction: "hostile" });
    const state = makeState([a, b], "econ-4");
    startCombat(state, {
      participants: ["a", "b"],
      grid: { w: 8, h: 8, cell_ft: 5 },
      positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, // adjacent: attacks are in reach
    });
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
