import type { Actor, ActiveCondition, ConditionName, DamageType } from "@adm/schemas";
import { roll, rollD20 } from "./dice.js";
import { savingThrow } from "./checks.js";
import { attackMods, combineAdv, type Advantage } from "./conditions.js";
import { coverBetween, distanceFt } from "./grid.js";
import { removeFromCombat } from "./turns.js";
import { csCondition, csDamage } from "@adm/schemas";
import { abilityMod, actorAc, getActor, log, type GameState } from "./state.js";

function damageMultiplier(actor: Actor, type?: string): { mult: number; tag: string } {
  if (!type) return { mult: 1, tag: "" };
  const a = actor as unknown as {
    resistances?: string[];
    immunities?: string[];
    vulnerabilities?: string[];
  };
  if (a.immunities?.includes(type)) return { mult: 0, tag: " (imunita)" };
  if (a.resistances?.includes(type)) return { mult: 0.5, tag: " (odolnost)" };
  if (a.vulnerabilities?.includes(type)) return { mult: 2, tag: " (zranitelnost)" };
  return { mult: 1, tag: "" };
}

export interface DamageResult {
  hp_before: number;
  hp_after: number;
  temp_absorbed: number;
  resisted: boolean;
  dropped: boolean;
}

/** Apply damage to a target, accounting for temp HP and resistance/immunity. */
export function applyDamage(
  state: GameState,
  args: { target: string; amount: number; type?: DamageType | string },
): DamageResult {
  const target = getActor(state, args.target);
  const { mult, tag } = damageMultiplier(target, args.type);
  const amount = Math.floor(args.amount * mult);
  const hpBefore = target.hp.current;

  let remaining = amount;
  let tempAbsorbed = 0;
  if (target.hp.temp > 0) {
    tempAbsorbed = Math.min(target.hp.temp, remaining);
    target.hp.temp -= tempAbsorbed;
    remaining -= tempAbsorbed;
  }
  target.hp.current = Math.max(0, target.hp.current - remaining);
  const dropped = hpBefore > 0 && target.hp.current === 0;
  if (dropped && !target.conditions.some((c) => c.name === "unconscious")) {
    target.conditions.push({ name: "unconscious", source: "0 hp", duration: null });
    target.death_saves = { success: 0, fail: 0 };
  }

  log(state, {
    kind: "damage",
    target: args.target,
    detail: `${target.name} utrpí ${amount}${args.type ? ` ${csDamage(args.type)}` : ""} zranění${tag} → ${hpBefore} → ${target.hp.current} HP${dropped ? " (padá!)" : ""}`,
    tool: "apply_damage",
    result: { hp_before: hpBefore, hp_after: target.hp.current, resisted: mult === 0.5, dropped },
  });

  // Concentration check on taking damage (§8.1). Dropping to 0 HP breaks it
  // outright; otherwise a CON save vs DC = max(10, ⌊damage/2⌋).
  if (target.concentration) {
    if (dropped) {
      log(state, {
        kind: "concentration",
        target: args.target,
        detail: `${target.name} ztrácí soustředění na ${target.concentration.spell} (v bezvědomí)`,
        tool: "apply_damage",
      });
      target.concentration = null;
    } else if (amount > 0) {
      const dc = Math.max(10, Math.floor(amount / 2));
      const save = savingThrow(state, { actor: args.target, ability: "con", dc });
      if (!save.success) {
        log(state, {
          kind: "concentration",
          target: args.target,
          detail: `${target.name} ztrácí soustředění na ${target.concentration.spell}`,
          tool: "apply_damage",
        });
        target.concentration = null;
      }
    }
  }

  return {
    hp_before: hpBefore,
    hp_after: target.hp.current,
    temp_absorbed: tempAbsorbed,
    resisted: mult === 0.5,
    dropped,
  };
}

export interface HealResult {
  hp_before: number;
  hp_after: number;
}

export function heal(state: GameState, args: { target: string; amount: number }): HealResult {
  const target = getActor(state, args.target);
  const hpBefore = target.hp.current;
  if (hpBefore === 0) {
    // Revived from unconscious.
    target.conditions = target.conditions.filter((c) => c.name !== "unconscious");
    target.death_saves = { success: 0, fail: 0 };
  }
  target.hp.current = Math.min(target.hp.max, target.hp.current + args.amount);
  log(state, {
    kind: "heal",
    target: args.target,
    detail: `${target.name} se léčí o ${args.amount} → ${hpBefore} → ${target.hp.current} HP`,
    tool: "heal",
    result: { hp_before: hpBefore, hp_after: target.hp.current },
  });
  return { hp_before: hpBefore, hp_after: target.hp.current };
}

interface AttackProfile {
  toHitMod: number;
  damageExpr: string;
  damageType: string;
  name: string;
}

function resolveAttackProfile(state: GameState, attacker: Actor, weaponId?: string): AttackProfile {
  // Monster action (srd_ref or inline) takes priority when no PC weapon given.
  const ref = attacker.srd_ref ? state.srd.monster(attacker.srd_ref) : undefined;
  if (ref && ref.actions.length > 0) {
    const action = ref.actions[0]!;
    return {
      toHitMod: action.attack_bonus ?? 0,
      damageExpr: action.damage ?? "1d4",
      damageType: action.damage_type ?? "bludgeoning",
      name: action.name,
    };
  }
  // PC weapon attack from SRD equipment.
  const eq = weaponId ? state.srd.equipment(weaponId) : undefined;
  const finesse = eq?.properties.includes("finesse");
  const useDex = finesse ? abilityMod(attacker.abilities.dex) >= abilityMod(attacker.abilities.str) : false;
  const abilMod = useDex ? abilityMod(attacker.abilities.dex) : abilityMod(attacker.abilities.str);
  const toHitMod = abilMod + attacker.proficiency_bonus;
  const baseDamage = eq?.damage ?? "1d4";
  const sign = abilMod >= 0 ? `+${abilMod}` : `${abilMod}`;
  return {
    toHitMod,
    damageExpr: `${baseDamage}${abilMod !== 0 ? sign : ""}`,
    damageType: eq?.damage_type ?? "bludgeoning",
    name: eq?.name ?? "Unarmed Strike",
  };
}

export interface AttackResult {
  to_hit: number;
  hit: boolean;
  crit: boolean;
  damage?: number;
  type?: string;
  detail: string;
}

/** Resolve a weapon attack: to-hit vs AC, crit on nat 20, doubled dice on crit. */
export function attack(
  state: GameState,
  args: { attacker: string; target: string; weapon?: string; advantage?: Advantage; allow_friendly?: boolean },
): AttackResult {
  const attacker = getActor(state, args.attacker);
  const target = getActor(state, args.target);

  // Friendly-fire guard (#12): refuse an attack on a fellow party/ally member
  // unless the player has explicitly confirmed it. Prevents the DM from quietly
  // turning a mis-mapped action into damage on a companion.
  const onSameSide = (a: string, b: string) =>
    (a === "party" || a === "ally") && (b === "party" || b === "ally");
  if (!args.allow_friendly && attacker.id !== target.id && onSameSide(attacker.faction, target.faction)) {
    const detail = `${attacker.name} míří na spojence ${target.name} — útok na člena družiny vyžaduje výslovné potvrzení.`;
    log(state, { kind: "attack", actor: args.attacker, target: args.target, detail, tool: "attack" });
    return { to_hit: 0, hit: false, crit: false, detail };
  }

  const profile = resolveAttackProfile(state, attacker, args.weapon);

  // Cover / line-of-sight from encounter terrain (§8.1).
  const combat = state.session.combat;
  const from = combat ? (combat.tokens[args.attacker] ?? attacker.position) : attacker.position;
  const to = combat ? (combat.tokens[args.target] ?? target.position) : target.position;
  let coverNote = "";
  let coverAc = 0;
  if (combat && from && to) {
    const cov = coverBetween(state, from, to);
    if (!cov.clearLineOfSight) {
      const detail = `${attacker.name} nemůže zasáhnout ${target.name} — plně kryt (mimo dohled)`;
      log(state, { kind: "attack", actor: args.attacker, target: args.target, detail, tool: "attack" });
      return { to_hit: 0, hit: false, crit: false, detail };
    }
    coverAc = cov.acBonus;
    if (cov.cover !== "none") coverNote = ` (kryt ${cov.cover}: +${cov.acBonus} AC)`;
  }

  // Condition-driven advantage/disadvantage, auto-crit, and can't-act (§8.1).
  const weaponEq = args.weapon ? state.srd.equipment(args.weapon) : undefined;
  const ranged = !!weaponEq?.range_ft || (weaponEq?.properties?.includes("ammunition") ?? false);
  const adjacent =
    combat && from && to
      ? distanceFt(from, to, combat.grid.cell_ft, state.variant.diagonals) <= 5
      : true;
  const cmods = attackMods(attacker, target, { ranged, adjacent });
  if (cmods.blocked) {
    const detail = `${attacker.name} nemůže útočit (neschopen jednat)`;
    log(state, { kind: "attack", actor: args.attacker, target: args.target, detail, tool: "attack" });
    return { to_hit: 0, hit: false, crit: false, detail };
  }
  const adv = combineAdv([args.advantage ?? "none", cmods.advantage]);

  const d20 = rollD20(state.rng, profile.toHitMod, adv);
  const ac = actorAc(target) + coverAc;
  const autoMiss = d20.natural === 1;
  const hit = !autoMiss && (d20.natural === 20 || d20.total >= ac);
  const crit = hit && (d20.natural === 20 || cmods.autoCrit);

  let damage: number | undefined;
  let damageDetail = "";
  if (hit) {
    const dmgRoll = roll(profile.damageExpr, state.rng);
    let total = dmgRoll.total;
    if (crit) {
      // Crit: roll the dice portion again and add it.
      const extra = roll(profile.damageExpr.replace(/[+-]\d+$/, ""), state.rng);
      const diceOnly = extra.total - extra.modifier;
      total += diceOnly;
    }
    damage = Math.max(0, total);
    damageDetail = `; ${profile.damageExpr}${crit ? " (KRIT ×2 kostky)" : ""} = ${damage} ${csDamage(profile.damageType)} zranění`;
  }

  const detail = `${attacker.name} útočí na ${target.name} (${profile.name}): ${d20.detail} vs AC ${ac}${coverNote} → ${
    crit ? "KRIT" : hit ? "zásah" : "minutí"
  }${damageDetail}`;
  log(state, {
    kind: "attack",
    actor: args.attacker,
    target: args.target,
    detail,
    tool: "attack",
    result: { to_hit: d20.total, hit, crit, damage, type: profile.damageType },
  });

  return {
    to_hit: d20.total,
    hit,
    crit,
    damage,
    type: hit ? profile.damageType : undefined,
    detail,
  };
}

export interface DeathSaveResult {
  roll: number;
  success: boolean;
  successes: number;
  failures: number;
  outcome: "dying" | "stable" | "revived" | "dead";
  detail: string;
}

/**
 * A death saving throw (SRD): DC 10 flat d20. Nat 20 revives with 1 HP; nat 1
 * counts as two failures. Three successes → stable; three failures → dead.
 */
export function deathSave(state: GameState, args: { actor: string }): DeathSaveResult {
  const actor = getActor(state, args.actor);
  // Death saves only apply to a creature at 0 HP that isn't yet stable/dead.
  if (actor.hp.current > 0) {
    return {
      roll: 0,
      success: false,
      successes: actor.death_saves.success,
      failures: actor.death_saves.fail,
      outcome: "stable",
      detail: `${actor.name} není v bezvědomí — záchrana před smrtí se neprovádí.`,
    };
  }
  const d = rollD20(state.rng);
  const ds = actor.death_saves;
  let outcome: DeathSaveResult["outcome"] = "dying";
  let success = false;

  if (d.natural === 20) {
    actor.hp.current = 1;
    actor.conditions = actor.conditions.filter((c) => c.name !== "unconscious");
    actor.death_saves = { success: 0, fail: 0 };
    outcome = "revived";
    success = true;
  } else if (d.natural === 1) {
    ds.fail = Math.min(3, ds.fail + 2);
  } else if (d.natural >= 10) {
    ds.success = Math.min(3, ds.success + 1);
    success = true;
  } else {
    ds.fail = Math.min(3, ds.fail + 1);
  }

  if (outcome !== "revived") {
    if (ds.success >= 3) {
      outcome = "stable";
      actor.death_saves = { success: 0, fail: 0 };
    } else if (ds.fail >= 3) {
      outcome = "dead";
      markDead(state, actor);
    }
  }

  const detail =
    `${actor.name} záchrana před smrtí: d20 ${d.natural} → ` +
    (outcome === "revived"
      ? "NÁVRAT (1 HP)!"
      : outcome === "stable"
        ? "stabilizován"
        : outcome === "dead"
          ? "umírá"
          : `${success ? "úspěch" : "neúspěch"} (${actor.death_saves.success}✓/${actor.death_saves.fail}✗)`);
  log(state, { kind: "death-save", actor: args.actor, detail, tool: "death_save", result: { outcome } });
  return {
    roll: d.natural,
    success,
    successes: actor.death_saves.success,
    failures: actor.death_saves.fail,
    outcome,
    detail,
  };
}

/**
 * Mark an actor permanently dead (#23): set the flag and pull them out of the
 * initiative order. The body stays unconscious for narration. Death is not
 * recoverable here; only a dedicated revival spell (not yet modelled) would be.
 * Whether the *campaign* ends is decided separately (see `checkCampaignEnd`),
 * because that depends on the party roster the engine doesn't own.
 */
function markDead(state: GameState, actor: Actor): void {
  actor.dead = true;
  if (!actor.conditions.some((c) => c.name === "unconscious")) {
    actor.conditions.push({ name: "unconscious", source: "mrtev", duration: null });
  }
  removeFromCombat(state, actor.id);
}

/**
 * Decide whether a death ends the campaign (#23). Only a *single-character*
 * campaign ends when its lone hero dies — multi-character parties play on (a
 * fallen member can be replaced). `roster` is the campaign's party id list
 * (owned by the server config), passed in so the engine stays roster-agnostic.
 */
export function checkCampaignEnd(state: GameState, roster: string[]): void {
  if (state.session.ending) return;
  if (roster.length !== 1) return; // only solo campaigns end on death
  const hero = state.actors[roster[0]!];
  if (!hero?.dead) return;
  state.session.ending = {
    reason: `${hero.name} nepřežívá záchrany před smrtí. Výprava končí.`,
    actor: hero.id,
  };
  log(state, {
    kind: "death",
    actor: hero.id,
    detail: `${hero.name} umírá. ${state.session.ending.reason}`,
    tool: "death_save",
  });
}

export function applyCondition(
  state: GameState,
  args: { target: string; condition: ConditionName; source?: string; duration?: number | null },
): { conditions: ActiveCondition[] } {
  const target = getActor(state, args.target);
  if (!target.conditions.some((c) => c.name === args.condition)) {
    target.conditions.push({
      name: args.condition,
      source: args.source,
      duration: args.duration ?? null,
    });
    log(state, {
      kind: "condition",
      target: args.target,
      detail: `${target.name} získává stav: ${csCondition(args.condition)}`,
      tool: "apply_condition",
    });
  }
  return { conditions: target.conditions };
}

export function removeCondition(
  state: GameState,
  args: { target: string; condition: ConditionName },
): { conditions: ActiveCondition[] } {
  const target = getActor(state, args.target);
  target.conditions = target.conditions.filter((c) => c.name !== args.condition);
  log(state, {
    kind: "condition",
    target: args.target,
    detail: `${target.name} ztrácí stav: ${csCondition(args.condition)}`,
    tool: "remove_condition",
  });
  return { conditions: target.conditions };
}
