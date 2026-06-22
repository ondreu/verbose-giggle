import type { Actor, AbilityKey, ConditionName } from "@adm/schemas";

export type Advantage = "advantage" | "disadvantage" | "none";

/** Combine any number of advantage sources: adv + disadv cancel to none. */
export function combineAdv(list: Advantage[]): Advantage {
  const a = list.includes("advantage");
  const d = list.includes("disadvantage");
  return a && d ? "none" : a ? "advantage" : d ? "disadvantage" : "none";
}

export function hasCond(actor: Actor, name: ConditionName): boolean {
  return actor.conditions.some((c) => c.name === name);
}

const INCAPACITATING: ConditionName[] = [
  "incapacitated",
  "paralyzed",
  "petrified",
  "stunned",
  "unconscious",
];

/** Incapacitated creatures can't take actions or reactions (SRD). */
export function isIncapacitated(actor: Actor): boolean {
  return INCAPACITATING.some((n) => hasCond(actor, n));
}

/** Movement-zeroing conditions (grappled/restrained + incapacitating set). */
export function movementBlocked(actor: Actor): boolean {
  return hasCond(actor, "grappled") || hasCond(actor, "restrained") || isIncapacitated(actor);
}

export interface AttackMods {
  advantage: Advantage;
  autoCrit: boolean;
  /** Attacker can't act (incapacitated). */
  blocked: boolean;
}

/**
 * Net attack modifiers from the attacker's and target's conditions (SRD §8.1).
 * Attacker disadvantage: blinded/frightened/poisoned/prone/restrained.
 * Advantage vs target: blinded/paralyzed/petrified/restrained/stunned/unconscious,
 * and a prone target (melee adv, ranged disadvantage). An attack that hits a
 * paralyzed/unconscious target from within 5 ft is an automatic crit.
 */
export function attackMods(
  attacker: Actor,
  target: Actor,
  opts: { ranged: boolean; adjacent: boolean },
): AttackMods {
  if (isIncapacitated(attacker)) return { advantage: "none", autoCrit: false, blocked: true };

  const adv: Advantage[] = [];
  if (
    hasCond(attacker, "blinded") ||
    hasCond(attacker, "frightened") ||
    hasCond(attacker, "poisoned") ||
    hasCond(attacker, "prone") ||
    hasCond(attacker, "restrained")
  ) {
    adv.push("disadvantage");
  }
  if (
    hasCond(target, "blinded") ||
    hasCond(target, "paralyzed") ||
    hasCond(target, "petrified") ||
    hasCond(target, "restrained") ||
    hasCond(target, "stunned") ||
    hasCond(target, "unconscious")
  ) {
    adv.push("advantage");
  }
  if (hasCond(target, "prone")) adv.push(opts.ranged ? "disadvantage" : "advantage");

  const autoCrit =
    opts.adjacent && !opts.ranged && (hasCond(target, "paralyzed") || hasCond(target, "unconscious"));
  return { advantage: combineAdv(adv), autoCrit, blocked: false };
}

export interface SaveMods {
  advantage: Advantage;
  autoFail: boolean;
}

/** Saving-throw modifiers from conditions: auto-fail STR/DEX while paralyzed/
 *  stunned/unconscious/petrified; disadvantage on DEX saves while restrained. */
export function saveMods(actor: Actor, ability: AbilityKey): SaveMods {
  const autoFail =
    (ability === "str" || ability === "dex") &&
    (hasCond(actor, "paralyzed") ||
      hasCond(actor, "stunned") ||
      hasCond(actor, "unconscious") ||
      hasCond(actor, "petrified"));
  const dis = ability === "dex" && hasCond(actor, "restrained");
  return { advantage: dis ? "disadvantage" : "none", autoFail };
}

/** Ability-check modifiers: disadvantage while poisoned or frightened. */
export function checkMods(actor: Actor): { advantage: Advantage } {
  const dis = hasCond(actor, "poisoned") || hasCond(actor, "frightened");
  return { advantage: dis ? "disadvantage" : "none" };
}
