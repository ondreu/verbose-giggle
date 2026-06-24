import type { Actor } from "@adm/schemas";
import type { SrdSpell } from "@adm/srd";
import { roll, rollD20 } from "./dice.js";
import { applyDamage, heal } from "./combat.js";
import { savingThrow } from "./checks.js";
import type { Advantage } from "./conditions.js";
import { abilityMod, getActor, log, type GameState } from "./state.js";

export interface CastResult {
  slot_consumed: number | null;
  attacks?: { target: string; hit: boolean; damage?: number }[];
  saves?: { target: string; success: boolean; damage?: number }[];
  healed?: { target: string; amount: number }[];
  affected: string[];
  concentration: boolean;
  detail: string;
  error?: string;
}

/**
 * Spellcasting ability modifier. Prefers the SRD class's declared spellcasting
 * ability (#20) when a dataset is mounted; otherwise falls back to a per-class
 * map, then to the highest mental stat.
 */
function spellMod(state: GameState, casterId: string): number {
  const a = getActor(state, casterId);
  const cls = (a.class ?? "").toLowerCase();
  const srdAbility = state.srd.class(cls)?.spellcasting_ability;
  if (srdAbility) return abilityMod(a.abilities[srdAbility]);
  if (["wizard", "artificer"].includes(cls)) return abilityMod(a.abilities.int);
  if (["cleric", "druid", "ranger"].includes(cls)) return abilityMod(a.abilities.wis);
  if (["sorcerer", "warlock", "bard", "paladin"].includes(cls)) return abilityMod(a.abilities.cha);
  return Math.max(abilityMod(a.abilities.int), abilityMod(a.abilities.wis), abilityMod(a.abilities.cha));
}

function spellSaveDc(state: GameState, casterId: string): number {
  const a = getActor(state, casterId);
  return 8 + a.proficiency_bonus + spellMod(state, casterId);
}

/** Pick the value from a numeric-keyed scaling map for level `n` (highest key ≤ n). */
/**
 * Strip the SRD dataset's `MOD` placeholder from a dice string. The 5e-database
 * encodes healing as e.g. `"1d8 + MOD"`, where MOD is the spellcasting modifier;
 * the engine adds that modifier itself, so the literal token must be removed or
 * the dice expression is invalid (`"1d8 + MOD+3"`). Returns undefined if nothing
 * dice-like remains.
 */
function cleanDice(expr: string | undefined): string | undefined {
  if (!expr) return undefined;
  const out = expr.replace(/\s*[+-]\s*MOD\b/gi, "").trim();
  return out || undefined;
}

function scaledDice(map: Record<string, string> | undefined, n: number): string | undefined {
  if (!map) return undefined;
  const keys = Object.keys(map)
    .map((k) => Number(k))
    .filter((k) => Number.isFinite(k) && k <= n)
    .sort((a, b) => b - a);
  return keys.length ? cleanDice(map[String(keys[0])]) : undefined;
}

/**
 * Damage dice for a cast: cantrips scale by caster level, leveled spells by the
 * slot used. Falls back to the spell's base `damage`. SRD-mounted spells carry
 * the scaling maps (#20); the bundled subset just has `damage`.
 */
function spellDamageDice(spell: SrdSpell, caster: Actor, slotLevel: number): string | undefined {
  if (spell.level === 0) return scaledDice(spell.damage_by_level, caster.level) ?? cleanDice(spell.damage);
  return scaledDice(spell.damage_by_slot, Math.max(slotLevel, spell.level)) ?? cleanDice(spell.damage);
}

/**
 * Cast a spell: consume a slot, resolve spell attacks/saves against targets via
 * the engine, apply damage/healing, and set concentration. All numbers are
 * engine-produced (§8.1).
 */
export function castSpell(
  state: GameState,
  args: {
    caster: string;
    spell: string;
    slot_level: number;
    targets?: string[];
    advantage?: Advantage;
  },
): CastResult {
  const caster = getActor(state, args.caster);
  const spell = state.srd.spell(args.spell);
  if (!spell) return { slot_consumed: null, affected: [], concentration: false, detail: "", error: `Unknown spell: ${args.spell}` };

  // Sheet validation (#29): a player character may only cast spells on their
  // own known/prepared list. Refuse gracefully (no slot spent) and log the
  // refusal so it's auditable — the DM must not narrate a spell that never ran.
  // Monsters use innate/statblock casting, so they bypass this check.
  if (caster.type === "character" && !(caster.spells_known ?? []).includes(args.spell)) {
    const detail = `${caster.name} neumí kouzlo „${spell.name}" — není v jeho seznamu kouzel.`;
    log(state, { kind: "spell", actor: args.caster, detail, tool: "cast_spell" });
    return { slot_consumed: null, affected: [], concentration: false, detail, error: detail };
  }

  // Consume a slot (cantrips are level 0, free). A spell can never be cast below
  // its own base level, so clamp the requested slot up to the spell's level —
  // this also covers the DM omitting slot_level (it defaults to 0), which would
  // otherwise wrongly look for a non-existent level-0 slot and never spend one (#9).
  let slotConsumed: number | null = null;
  if (spell.level > 0) {
    const slotLevel = Math.max(args.slot_level, spell.level);
    const tier = String(slotLevel);
    const slot = caster.spell_slots[tier];
    if (!slot || slot.used >= slot.max) {
      return {
        slot_consumed: null,
        affected: [],
        concentration: false,
        detail: "",
        error: `No level ${slotLevel} slot available`,
      };
    }
    slot.used += 1;
    slotConsumed = slotLevel;
  }

  const targets = args.targets ?? [];
  const result: CastResult = {
    slot_consumed: slotConsumed,
    affected: targets,
    concentration: spell.concentration,
    detail: "",
  };
  const mod = spellMod(state, args.caster);
  const slotForScaling = Math.max(args.slot_level, spell.level);
  const damageDice = spellDamageDice(spell, caster, slotForScaling);
  // Healing dice for the slot used (SRD heal_by_slot), spell mod added below.
  const healDice = scaledDice(spell.heal_by_slot, slotForScaling);

  if (spell.attack === "ranged" || spell.attack === "melee") {
    result.attacks = [];
    const toHit = mod + caster.proficiency_bonus;
    for (const t of targets) {
      const target = getActor(state, t);
      const d20 = rollD20(state.rng, toHit, args.advantage ?? "none");
      const crit = d20.natural === 20;
      const hit = crit || (d20.natural !== 1 && d20.total >= target.ac);
      let dmg: number | undefined;
      if (hit && damageDice) {
        const r = roll(damageDice, state.rng);
        dmg = crit ? r.total + (r.total - r.modifier) : r.total;
        applyDamage(state, { target: t, amount: dmg, type: spell.damage_type });
      }
      result.attacks.push({ target: t, hit, damage: dmg });
    }
  } else if (spell.save) {
    result.saves = [];
    const dc = spellSaveDc(state, args.caster);
    // dc_success: "half" → half damage on a save; "none"/anything else → no damage.
    const onSuccess = spell.save.effect === "half" ? "half" : "none";
    for (const t of targets) {
      const save = savingThrow(state, { actor: t, ability: spell.save.ability, dc });
      let dmg: number | undefined;
      if (damageDice) {
        const r = roll(damageDice, state.rng);
        dmg = save.success ? (onSuccess === "half" ? Math.floor(r.total / 2) : 0) : r.total;
        if (dmg) applyDamage(state, { target: t, amount: dmg, type: spell.damage_type });
      }
      result.saves.push({ target: t, success: save.success, damage: dmg });
    }
  } else if (healDice || (spell.damage && spell.damage_type === "radiant" && spell.id.includes("cure"))) {
    // Healing spell — SRD heal_by_slot, or a radiant cure-* heuristic fallback.
    const dice = healDice ?? cleanDice(spell.damage)!;
    result.healed = [];
    for (const t of targets) {
      const r = roll(`${dice}+${mod}`, state.rng);
      heal(state, { target: t, amount: r.total });
      result.healed.push({ target: t, amount: r.total });
    }
  }

  if (spell.concentration) {
    caster.concentration = { spell: spell.name, dc_to_maintain: 10 };
  }

  result.detail = `${caster.name} sesílá ${spell.name}${slotConsumed ? ` (slot ${slotConsumed}. úrovně)` : " (cantrip)"} → ${targets.length} cílů`;
  log(state, {
    kind: "spell",
    actor: args.caster,
    detail: result.detail,
    tool: "cast_spell",
    result: { slot_consumed: slotConsumed, affected: targets },
  });
  return result;
}

/** CON save to maintain concentration after taking damage (DC = max(10, dmg/2)). */
export function concentrationCheck(
  state: GameState,
  args: { actor: string; damage: number },
): { maintained: boolean; dc: number } {
  const actor = getActor(state, args.actor);
  if (!actor.concentration) return { maintained: true, dc: 0 };
  const dc = Math.max(10, Math.floor(args.damage / 2));
  const save = savingThrow(state, { actor: args.actor, ability: "con", dc });
  if (!save.success) {
    log(state, {
      kind: "concentration",
      actor: args.actor,
      detail: `${actor.name} loses concentration on ${actor.concentration.spell}`,
      tool: "concentration_check",
    });
    actor.concentration = null;
  }
  return { maintained: save.success, dc };
}
