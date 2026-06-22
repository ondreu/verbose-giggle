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

/**
 * Short Czech rules descriptions for each condition (#34). Surfaced as tooltips/
 * popovers on the sheet's condition chips. (A fuller localization can later draw
 * on the SRD Conditions dataset, #21.)
 */
export const CONDITION_DESC_CS: Record<ConditionName, string> = {
  blinded: "Nevidíš: automaticky selháváš u zkoušek vyžadujících zrak. Útoky na tebe mají výhodu, tvé útoky nevýhodu.",
  charmed: "Nemůžeš útočit na původce ani ho cílit škodlivými efekty. Původce má výhodu na společenské zkoušky vůči tobě.",
  deafened: "Neslyšíš a automaticky selháváš u zkoušek vyžadujících sluch.",
  exhaustion: "Vyčerpání: ve stupních přidává postihy ke zkouškám i rychlosti; nejvyšší stupeň znamená smrt.",
  frightened: "Dokud vidíš zdroj strachu, máš nevýhodu na zkoušky i útoky a nemůžeš se k němu dobrovolně přiblížit.",
  grappled: "Sevřen: tvá rychlost je 0, nemůžeš se pohybovat.",
  incapacitated: "Neschopen jednat: nemůžeš provádět akce ani reakce.",
  invisible: "Neviditelný: útoky na tebe mají nevýhodu, tvé útoky výhodu.",
  paralyzed: "Ochromen: neschopen jednat, nehýbeš se ani nemluvíš. Útoky zblízka jsou automaticky kritické.",
  petrified: "Zkamenělý: neschopen jednat, odolnost vůči zranění, imunita vůči jedu a nemoci.",
  poisoned: "Otráven: nevýhoda na útoky a na zkoušky vlastností.",
  prone: "Na zemi: pohyb jen plazením, nevýhoda na útoky. Útoky zblízka na tebe mají výhodu, na dálku nevýhodu.",
  restrained: "Spoután: rychlost 0, nevýhoda na útoky a na záchrany Obratnosti. Útoky na tebe mají výhodu.",
  stunned: "Omráčen: neschopen jednat, nehýbeš se, mluvíš zajíkavě. Útoky na tebe mají výhodu.",
  unconscious: "V bezvědomí: neschopen jednat, nevnímáš okolí, upustíš co držíš a padneš. Útoky zblízka jsou kritické.",
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

/** Player-facing Czech names for SRD races (ids stay English). */
export const RACE_CS: Record<string, string> = {
  human: "Člověk",
  elf: "Elf",
  dwarf: "Trpaslík",
  halfling: "Půlčík",
  "half-orc": "Půlork",
  "half-elf": "Půlelf",
  tiefling: "Tiefling",
  dragonborn: "Drakorozený",
  gnome: "Gnóm",
};

export const SUBRACE_CS: Record<string, string> = {
  "hill-dwarf": "Pahorkatinný trpaslík",
  "mountain-dwarf": "Horský trpaslík",
  "high-elf": "Vznešený elf",
  "wood-elf": "Lesní elf",
  "dark-elf": "Temný elf (drow)",
  "lightfoot-halfling": "Lehkonohý půlčík",
  "stout-halfling": "Statný půlčík",
  "rock-gnome": "Skalní gnóm",
  "forest-gnome": "Lesní gnóm",
};

export const CLASS_CS: Record<string, string> = {
  fighter: "Bojovník",
  barbarian: "Barbar",
  rogue: "Tulák",
  monk: "Mnich",
  ranger: "Hraničář",
  paladin: "Paladin",
  cleric: "Klerik",
  druid: "Druid",
  wizard: "Kouzelník",
  sorcerer: "Čaroděj",
  bard: "Bard",
  warlock: "Černokněžník",
};

/** Schools of magic — for spell pickers and tooltips (#21). */
export const SPELL_SCHOOL_CS: Record<string, string> = {
  abjuration: "abjurace",
  conjuration: "konjurace",
  divination: "věštění",
  enchantment: "očarování",
  evocation: "evokace",
  illusion: "iluze",
  necromancy: "nekromancie",
  transmutation: "transmutace",
};

/** A handful of common feats; unknown ids fall back to the SRD name. */
export const FEAT_CS: Record<string, string> = {
  alert: "Ostražitý",
  "great-weapon-master": "Mistr velkých zbraní",
  lucky: "Šťastlivec",
  "magic-initiate": "Zasvěcenec magie",
  "war-caster": "Válečný sesílatel",
  resilient: "Houževnatý",
  tough: "Otužilý",
  sentinel: "Strážce",
  sharpshooter: "Ostrostřelec",
  grappler: "Zápasník",
};

/** Translate a possibly-unknown key, falling back to the original string. */
export function csDamage(type?: string): string {
  if (!type) return "";
  return DAMAGE_CS[type as DamageType] ?? type;
}
export function csCondition(name: string): string {
  return CONDITION_CS[name as ConditionName] ?? name;
}
export function csConditionDesc(name: string): string {
  return CONDITION_DESC_CS[name as ConditionName] ?? "";
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
/** Race/class/subrace/feat/school names, falling back to a given label or the id. */
export function csRace(id: string, fallback?: string): string {
  return RACE_CS[id] ?? fallback ?? id;
}
export function csSubrace(id: string, fallback?: string): string {
  return SUBRACE_CS[id] ?? fallback ?? id;
}
export function csClass(id: string, fallback?: string): string {
  return CLASS_CS[id] ?? fallback ?? id;
}
export function csFeat(id: string, fallback?: string): string {
  return FEAT_CS[id] ?? fallback ?? id;
}
export function csSpellSchool(id?: string): string {
  if (!id) return "";
  return SPELL_SCHOOL_CS[id] ?? id;
}
