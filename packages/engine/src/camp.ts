import { getActor, log, type GameState } from "./state.js";

/**
 * Party-roster management ("tábor" / camp). A party member can be sent to camp
 * so the player no longer plays or maintains them — they stop being placed in
 * encounters, never take an AI turn, and can't be the hotseat-active character —
 * yet they stay on the roster and can be recalled at any time. State lives in
 * the session overlay (`session.camp`), so it is fully reversible and never
 * edits the authored campaign roster. Mutated only through these engine tools so
 * every change hits the visible log (same determinism contract as #12).
 */

/** Awake (not-camped) party-faction members, in actor-record order. */
function awakeParty(state: GameState, exclude?: string): string[] {
  const camp = state.session.camp ?? [];
  return Object.values(state.actors)
    .filter((a) => a.faction === "party" && a.id !== exclude && !camp.includes(a.id))
    .map((a) => a.id);
}

/** Send a party member to camp (out-of-combat only). */
export function sendToCamp(state: GameState, args: { actor: string }): { camp: string[] } | { error: string } {
  const actor = getActor(state, args.actor);
  if (actor.faction !== "party") return { error: `${actor.name} není člen družiny, nelze poslat do tábora.` };
  if (state.session.combat) return { error: "V boji nelze postavu poslat do tábora." };

  const camp = (state.session.camp ??= []);
  if (camp.includes(args.actor)) return { camp };

  const awake = awakeParty(state, args.actor);
  if (awake.length === 0) {
    return { error: `${actor.name} je jediný bdělý člen družiny — někdo musí zůstat v akci.` };
  }
  camp.push(args.actor);

  // If the camped hero was the hotseat-active one, hand control to another
  // awake party member (prefer a human-controlled one) so play continues.
  if (state.session.active_player === args.actor) {
    const humans = awake.filter((id) => state.actors[id]?.controller === "human");
    state.session.active_player = humans[0] ?? awake[0] ?? null;
  }

  log(state, { kind: "camp", actor: args.actor, detail: `${actor.name} odchází do tábora (mimo hru).`, tool: "send_to_camp" });
  return { camp };
}

/** Recall a party member from camp back into active play. */
export function recallFromCamp(state: GameState, args: { actor: string }): { camp: string[] } | { error: string } {
  const actor = getActor(state, args.actor);
  const camp = (state.session.camp ??= []);
  if (!camp.includes(args.actor)) return { error: `${actor.name} není v táboře.` };

  state.session.camp = camp.filter((id) => id !== args.actor);
  // A fresh campaign with no active hotseat character adopts the recalled one.
  if (!state.session.active_player) state.session.active_player = args.actor;

  log(state, { kind: "camp", actor: args.actor, detail: `${actor.name} se vrací z tábora do hry.`, tool: "recall_from_camp" });
  return { camp: state.session.camp };
}
