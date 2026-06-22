import type { AbilityKey } from "@adm/schemas";
import { rollD20 } from "./dice.js";
import { abilityMod, getActor, log, SKILL_ABILITY, type GameState } from "./state.js";

export type Advantage = "advantage" | "disadvantage" | "none";

export interface CheckResult {
  roll: number;
  modifier: number;
  total: number;
  dc: number;
  success: boolean;
  detail: string;
}

/** Ability check, optionally a skill check (adds proficiency if proficient). */
export function abilityCheck(
  state: GameState,
  args: { actor: string; ability: AbilityKey; skill?: string; dc: number; advantage?: Advantage },
): CheckResult {
  const actor = getActor(state, args.actor);
  let modifier = abilityMod(actor.abilities[args.ability]);
  let proficient = false;
  if (args.skill && actor.proficiencies.skills.includes(args.skill)) {
    modifier += actor.proficiency_bonus;
    proficient = true;
  }
  const r = rollD20(state.rng, modifier, args.advantage ?? "none");
  const success = r.total >= args.dc;
  const label = args.skill ? `${args.skill} check` : `${args.ability.toUpperCase()} check`;
  const detail = `${label}: ${r.detail}${proficient ? " (prof)" : ""} vs DC ${args.dc} → ${success ? "success" : "fail"}`;
  log(state, {
    kind: "check",
    actor: args.actor,
    detail,
    tool: "ability_check",
    result: { roll: r.natural, modifier, total: r.total, dc: args.dc, success },
  });
  return { roll: r.natural, modifier, total: r.total, dc: args.dc, success, detail };
}

/** Saving throw (adds proficiency if proficient in that save). */
export function savingThrow(
  state: GameState,
  args: { actor: string; ability: AbilityKey; dc: number; advantage?: Advantage },
): CheckResult {
  const actor = getActor(state, args.actor);
  let modifier = abilityMod(actor.abilities[args.ability]);
  const proficient = actor.proficiencies.saves.includes(args.ability);
  if (proficient) modifier += actor.proficiency_bonus;
  const r = rollD20(state.rng, modifier, args.advantage ?? "none");
  const success = r.total >= args.dc;
  const detail = `${args.ability.toUpperCase()} save: ${r.detail}${proficient ? " (prof)" : ""} vs DC ${args.dc} → ${success ? "success" : "fail"}`;
  log(state, {
    kind: "save",
    actor: args.actor,
    detail,
    tool: "saving_throw",
    result: { roll: r.natural, modifier, total: r.total, dc: args.dc, success },
  });
  return { roll: r.natural, modifier, total: r.total, dc: args.dc, success, detail };
}

export { SKILL_ABILITY };
