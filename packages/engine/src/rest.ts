import { roll } from "./dice.js";
import { abilityMod, getActor, log, type GameState } from "./state.js";

export interface RestResult {
  actor: string;
  hp_after: number;
  hit_dice_spent?: number;
}

/** Short rest: each actor may spend hit dice to recover HP. */
export function shortRest(
  state: GameState,
  args: { actors: string[]; spend?: Record<string, number> },
): { results: RestResult[] } {
  const results: RestResult[] = [];
  for (const id of args.actors) {
    const actor = getActor(state, id);
    const toSpend = args.spend?.[id] ?? 0;
    let spent = 0;
    if (actor.hit_dice && toSpend > 0) {
      const conMod = abilityMod(actor.abilities.con);
      const available = Math.min(toSpend, actor.hit_dice.remaining);
      let recovered = 0;
      for (let i = 0; i < available; i++) {
        const r = roll(`1${actor.hit_dice.type}`, state.rng);
        recovered += Math.max(1, r.total + conMod);
      }
      actor.hit_dice.remaining -= available;
      spent = available;
      actor.hp.current = Math.min(actor.hp.max, actor.hp.current + recovered);
      log(state, {
        kind: "rest",
        actor: id,
        detail: `${actor.name} short rest: spent ${available} hit dice → +${recovered} hp (${actor.hp.current}/${actor.hp.max})`,
        tool: "short_rest",
      });
    }
    results.push({ actor: id, hp_after: actor.hp.current, hit_dice_spent: spent });
  }
  return { results };
}

/** Long rest: restore HP to max, all spell slots, and half of max hit dice. */
export function longRest(state: GameState, args: { actors: string[] }): { results: RestResult[] } {
  const results: RestResult[] = [];
  for (const id of args.actors) {
    const actor = getActor(state, id);
    actor.hp.current = actor.hp.max;
    actor.hp.temp = 0;
    actor.conditions = actor.conditions.filter((c) => c.name !== "unconscious");
    actor.death_saves = { success: 0, fail: 0 };
    actor.concentration = null;
    for (const tier of Object.values(actor.spell_slots)) tier.used = 0;
    if (actor.hit_dice) {
      const regained = Math.max(1, Math.floor(actor.hit_dice.total / 2));
      actor.hit_dice.remaining = Math.min(actor.hit_dice.total, actor.hit_dice.remaining + regained);
    }
    log(state, {
      kind: "rest",
      actor: id,
      detail: `${actor.name} long rest: full HP, slots restored`,
      tool: "long_rest",
    });
    results.push({ actor: id, hp_after: actor.hp.current });
  }
  // Advance the world clock by 8 hours.
  state.session.time.hour += 8;
  while (state.session.time.hour >= 24) {
    state.session.time.hour -= 24;
    state.session.time.day += 1;
  }
  return { results };
}
