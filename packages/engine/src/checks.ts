import { csAbilityAbbr, csCondition, csSkill, type AbilityKey } from "@adm/schemas";
import { rollD20 } from "./dice.js";
import { checkMods, combineAdv, saveMods, type Advantage } from "./conditions.js";
import { abilityMod, getActor, log, SKILL_ABILITY, type GameState } from "./state.js";

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
  const adv = combineAdv([args.advantage ?? "none", checkMods(actor).advantage]);
  const r = rollD20(state.rng, modifier, adv);
  const success = r.total >= args.dc;
  const label = args.skill ? `zkouška ${csSkill(args.skill)}` : `zkouška ${csAbilityAbbr(args.ability)}`;
  const detail = `${label}: ${r.detail}${proficient ? " (zdatnost)" : ""} vs DC ${args.dc} → ${success ? "úspěch" : "neúspěch"}`;
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
  const sm = saveMods(actor, args.ability);
  if (sm.autoFail) {
    const detail = `záchranný hod ${csAbilityAbbr(args.ability)}: automatický neúspěch (${actor.conditions.map((c) => csCondition(c.name)).join(", ")}) vs DC ${args.dc}`;
    log(state, {
      kind: "save",
      actor: args.actor,
      detail,
      tool: "saving_throw",
      result: { roll: 0, modifier: 0, total: 0, dc: args.dc, success: false },
    });
    return { roll: 0, modifier: 0, total: 0, dc: args.dc, success: false, detail };
  }
  let modifier = abilityMod(actor.abilities[args.ability]);
  const proficient = actor.proficiencies.saves.includes(args.ability);
  if (proficient) modifier += actor.proficiency_bonus;
  const adv = combineAdv([args.advantage ?? "none", sm.advantage]);
  const r = rollD20(state.rng, modifier, adv);
  const success = r.total >= args.dc;
  const detail = `záchranný hod ${csAbilityAbbr(args.ability)}: ${r.detail}${proficient ? " (zdatnost)" : ""} vs DC ${args.dc} → ${success ? "úspěch" : "neúspěch"}`;
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
