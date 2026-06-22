import type { ConditionName, DamageType, AbilityKey } from "./primitives.js";

/**
 * Czech labels for player-facing text (the guiding language of the project).
 * Identifiers/ids stay English; these map the closed enum sets to Czech for the
 * dice log and UI. Keep in sync with the enums in primitives.ts.
 */
export const CONDITION_CS: Record<ConditionName, string> = {
  blinded: "oslepen",
  charmed: "očarován",
  deafened: "ohlušen",
  exhaustion: "vyčerpání",
  frightened: "vyděšen",
  grappled: "sevřen",
  incapacitated: "neschopen jednat",
  invisible: "neviditelný",
  paralyzed: "ochromen",
  petrified: "zkamenělý",
  poisoned: "otráven",
  prone: "na zemi",
  restrained: "spoután",
  stunned: "omráčen",
  unconscious: "v bezvědomí",
};

export const DAMAGE_CS: Record<DamageType, string> = {
  acid: "kyselinové",
  bludgeoning: "drtivé",
  cold: "chladové",
  fire: "ohnivé",
  force: "silové",
  lightning: "bleskové",
  necrotic: "nekrotické",
  piercing: "bodné",
  poison: "jedové",
  psychic: "psychické",
  radiant: "zářivé",
  slashing: "sečné",
  thunder: "hromové",
};

/** Full Czech ability names (no two-letter shorthand, #4). */
export const ABILITY_CS: Record<AbilityKey, string> = {
  str: "Síla",
  dex: "Obratnost",
  con: "Odolnost",
  int: "Inteligence",
  wis: "Moudrost",
  cha: "Charisma",
};

/** Standard international 3-letter ability abbreviations for compact UI/log. */
export const ABILITY_ABBR: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

export const AOE_SHAPE_CS: Record<string, string> = {
  sphere: "koule",
  cube: "krychle",
  cone: "kužel",
  line: "čára",
};

/** SRD skill ids → Czech labels. Keep in sync with SKILL_ABILITY in the engine. */
export const SKILL_CS: Record<string, string> = {
  athletics: "atletika",
  acrobatics: "akrobacie",
  "sleight-of-hand": "obratnost rukou",
  stealth: "nenápadnost",
  arcana: "magie",
  history: "historie",
  investigation: "pátrání",
  nature: "příroda",
  religion: "náboženství",
  "animal-handling": "zacházení se zvířaty",
  insight: "vhled",
  medicine: "léčitelství",
  perception: "vnímání",
  survival: "přežití",
  deception: "klamání",
  intimidation: "zastrašování",
  performance: "vystupování",
  persuasion: "přesvědčování",
};

/** Translate a possibly-unknown key, falling back to the original string. */
export function csDamage(type?: string): string {
  if (!type) return "";
  return DAMAGE_CS[type as DamageType] ?? type;
}
export function csCondition(name: string): string {
  return CONDITION_CS[name as ConditionName] ?? name;
}
export function csAbility(k: string): string {
  return ABILITY_CS[k as AbilityKey] ?? k.toUpperCase();
}
/** Compact 3-letter ability label (STR/DEX/…) for grids and the dice log. */
export function csAbilityAbbr(k: string): string {
  return ABILITY_ABBR[k as AbilityKey] ?? k.toUpperCase();
}
export function csAoe(shape: string): string {
  return AOE_SHAPE_CS[shape] ?? shape;
}
export function csSkill(skill: string): string {
  return SKILL_CS[skill] ?? skill;
}
