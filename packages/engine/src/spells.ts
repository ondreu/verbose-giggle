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

/** Spellcasting ability modifier — uses the highest mental stat as a heuristic. */
function spellMod(state: GameState, casterId: string): number {
  const a = getActor(state, casterId);
  const cls = (a.class ?? "").toLowerCase();
  if (["wizard", "artificer"].includes(cls)) return abilityMod(a.abilities.int);
  if (["cleric", "druid", "ranger"].includes(cls)) return abilityMod(a.abilities.wis);
  if (["sorcerer", "warlock", "bard", "paladin"].includes(cls)) return abilityMod(a.abilities.cha);
  return Math.max(abilityMod(a.abilities.int), abilityMod(a.abilities.wis), abilityMod(a.abilities.cha));
}

function spellSaveDc(state: GameState, casterId: string): number {
  const a = getActor(state, casterId);
  return 8 + a.proficiency_bonus + spellMod(state, casterId);
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

  // Consume a slot (cantrips are level 0, free).
  let slotConsumed: number | null = null;
  if (spell.level > 0) {
    const tier = String(args.slot_level);
    const slot = caster.spell_slots[tier];
    if (!slot || slot.used >= slot.max) {
      return {
        slot_consumed: null,
        affected: [],
        concentration: false,
        detail: "",
        error: `No level ${args.slot_level} slot available`,
      };
    }
    slot.used += 1;
    slotConsumed = args.slot_level;
  }

  const targets = args.targets ?? [];
  const result: CastResult = {
    slot_consumed: slotConsumed,
    affected: targets,
    concentration: spell.concentration,
    detail: "",
  };
  const mod = spellMod(state, args.caster);

  if (spell.attack === "ranged" || spell.attack === "melee") {
    result.attacks = [];
    const toHit = mod + caster.proficiency_bonus;
    for (const t of targets) {
      const target = getActor(state, t);
      const d20 = rollD20(state.rng, toHit, args.advantage ?? "none");
      const crit = d20.natural === 20;
      const hit = crit || (d20.natural !== 1 && d20.total >= target.ac);
      let dmg: number | undefined;
      if (hit && spell.damage) {
        const r = roll(spell.damage, state.rng);
        dmg = crit ? r.total + (r.total - r.modifier) : r.total;
        applyDamage(state, { target: t, amount: dmg, type: spell.damage_type });
      }
      result.attacks.push({ target: t, hit, damage: dmg });
    }
  } else if (spell.save) {
    result.saves = [];
    const dc = spellSaveDc(state, args.caster);
    for (const t of targets) {
      const save = savingThrow(state, { actor: t, ability: spell.save.ability, dc });
      let dmg: number | undefined;
      if (spell.damage) {
        const r = roll(spell.damage, state.rng);
        dmg = save.success ? Math.floor(r.total / 2) : r.total;
        applyDamage(state, { target: t, amount: dmg, type: spell.damage_type });
      }
      result.saves.push({ target: t, success: save.success, damage: dmg });
    }
  } else if (spell.damage && spell.damage_type === "radiant" && spell.id.includes("cure")) {
    // Healing spell.
    result.healed = [];
    for (const t of targets) {
      const r = roll(`${spell.damage}+${mod}`, state.rng);
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
