import type { AbilityKey } from "@adm/schemas";
import { abilityMod, getActor, log, type GameState } from "./state.js";

/** Levels at which most classes grant an Ability Score Improvement (or feat). */
export const ASI_LEVELS = [4, 8, 12, 16, 19];

/** Cumulative XP required to REACH each level (index 0 = level 1). SRD. */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000,
  165000, 195000, 225000, 265000, 305000, 355000,
];

/** Proficiency bonus by level: +2 (1–4), +3 (5–8), +4 (9–12), +5, +6. */
export function proficiencyForLevel(level: number): number {
  return Math.ceil(Math.max(1, level) / 4) + 1;
}

/** Full-caster spell-slot maxima per level (tiers 1..9). */
const FULL_CASTER_SLOTS: number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const avgHitDie: Record<string, number> = { d6: 4, d8: 5, d10: 6, d12: 7 };

export interface LevelUpResult {
  actor: string;
  level: number;
  proficiency_bonus: number;
  hp_max: number;
  detail: string;
}

/**
 * Apply a single level-up to an actor (§8.1): bump level + proficiency bonus,
 * add hit points (fixed average of the class hit die + CON modifier, min 1),
 * grant a hit die, and — for full casters — recompute spell-slot maxima from
 * the standard table (preserving used slots). Caps at level 20.
 */
export function levelUp(state: GameState, args: { actor: string }): LevelUpResult | { error: string } {
  const actor = getActor(state, args.actor);
  if (actor.level >= 20) return { error: `${actor.name} is already level 20` };

  actor.level += 1;
  actor.proficiency_bonus = proficiencyForLevel(actor.level);

  const dieType = actor.hit_dice?.type ?? "d8";
  const gain = Math.max(1, (avgHitDie[dieType] ?? 5) + abilityMod(actor.abilities.con));
  actor.hp.max += gain;
  actor.hp.current += gain;
  if (actor.hit_dice) {
    actor.hit_dice.total += 1;
    actor.hit_dice.remaining = Math.min(actor.hit_dice.total, actor.hit_dice.remaining + 1);
  }

  // Full-caster slot progression (only for actors that already cast).
  if (Object.keys(actor.spell_slots).length > 0) {
    const row = FULL_CASTER_SLOTS[Math.min(actor.level, 20) - 1] ?? [];
    row.forEach((max, i) => {
      const tier = String(i + 1);
      const existing = actor.spell_slots[tier];
      actor.spell_slots[tier] = { max, used: Math.min(existing?.used ?? 0, max) };
    });
  }

  const detail = `${actor.name} postupuje na úroveň ${actor.level} (+${gain} HP, prof +${actor.proficiency_bonus})`;
  log(state, { kind: "level", actor: args.actor, detail, tool: "level_up" });
  return {
    actor: args.actor,
    level: actor.level,
    proficiency_bonus: actor.proficiency_bonus,
    hp_max: actor.hp.max,
    detail,
  };
}

/**
 * Apply an Ability Score Improvement (§8.1, level-up choice): distribute up to
 * +2 total across abilities, each score capped at 20. Validated so a level-up
 * can never inflate a sheet beyond the rules.
 */
export function applyAbilityIncrease(
  state: GameState,
  args: { actor: string; increments: Partial<Record<AbilityKey, number>> },
): { abilities: Record<string, number> } | { error: string } {
  const actor = getActor(state, args.actor);
  const inc = args.increments ?? {};
  const values = Object.values(inc).map((v) => v ?? 0);
  if (values.some((v) => v < 0 || !Number.isInteger(v))) return { error: "ASI increments must be non-negative integers" };
  const total = values.reduce((a, b) => a + b, 0);
  if (total > 2) return { error: "An ASI grants at most +2 total" };

  const applied: string[] = [];
  for (const [k, v] of Object.entries(inc)) {
    if (!v) continue;
    const key = k as AbilityKey;
    const before = actor.abilities[key];
    actor.abilities[key] = Math.min(20, before + v);
    if (actor.abilities[key] !== before) applied.push(`${key} → ${actor.abilities[key]}`);
  }
  log(state, {
    kind: "level",
    actor: args.actor,
    detail: `${actor.name} zvyšuje vlastnosti: ${applied.join(", ") || "beze změny"}`,
    tool: "ability_increase",
  });
  return { abilities: actor.abilities };
}

/** Learn one or more spells (level-up / training), de-duplicated. */
export function learnSpells(
  state: GameState,
  args: { actor: string; spells: string[] },
): { spells_known: string[]; added: string[] } {
  const actor = getActor(state, args.actor);
  const added: string[] = [];
  for (const raw of args.spells ?? []) {
    const id = raw.trim();
    if (id && !actor.spells_known.includes(id)) {
      actor.spells_known.push(id);
      added.push(id);
    }
  }
  if (added.length) {
    log(state, {
      kind: "level",
      actor: args.actor,
      detail: `${actor.name} se učí kouzla: ${added.join(", ")}`,
      tool: "learn_spell",
    });
  }
  return { spells_known: actor.spells_known, added };
}

export interface AwardXpResult {
  results: { actor: string; xp: number; level: number; leveled: boolean }[];
}

/** Award XP to actors and auto-level them across any thresholds crossed. */
export function awardXp(state: GameState, args: { actors: string[]; amount: number }): AwardXpResult {
  const results: AwardXpResult["results"] = [];
  for (const id of args.actors) {
    const actor = getActor(state, id);
    const startLevel = actor.level;
    actor.xp += args.amount;
    log(state, { kind: "xp", actor: id, detail: `${actor.name} získává ${args.amount} XP (celkem ${actor.xp})`, tool: "award_xp" });
    // Level up while enough XP for the next level (cap 20).
    while (actor.level < 20 && actor.xp >= (XP_THRESHOLDS[actor.level] ?? Infinity)) {
      levelUp(state, { actor: id });
    }
    results.push({ actor: id, xp: actor.xp, level: actor.level, leveled: actor.level > startLevel });
  }
  return { results };
}
