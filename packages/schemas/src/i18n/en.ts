import type { LabelBundle } from "./types.js";

/**
 * English bundle (#48a). Where the SRD id already reads as English, the long-tail
 * name maps (`spellName`/`itemName`) are intentionally left empty — the resolver
 * prettifies the id ("fire-bolt" → "Fire Bolt"). Only the short closed enums and
 * the descriptive rules text need explicit entries.
 *
 * Descriptions mirror SRD 5.1 wording; abilities/skills keep the same
 * parenthetical governing-ability hint as the Czech maps.
 */
const ABILITY: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const ABILITY_ABBR: Record<string, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

const ABILITY_DESC: Record<string, string> = {
  str: "Physical power and athletics: melee attacks, carrying, climbing and jumping.",
  dex: "Agility and reflexes: initiative, ranged attacks, AC in light armor, stealth.",
  con: "Health and stamina: hit point maximum and saves against poison, exhaustion and cold.",
  int: "Memory and reasoning: wizard magic, Arcana, History, Investigation.",
  wis: "Awareness and intuition: cleric/druid magic, Perception, Insight, Survival.",
  cha: "Force of personality: bard/sorcerer magic, Persuasion, Deception, Intimidation.",
};

const CONDITION: Record<string, string> = {
  blinded: "blinded",
  charmed: "charmed",
  deafened: "deafened",
  exhaustion: "exhaustion",
  frightened: "frightened",
  grappled: "grappled",
  incapacitated: "incapacitated",
  invisible: "invisible",
  paralyzed: "paralyzed",
  petrified: "petrified",
  poisoned: "poisoned",
  prone: "prone",
  restrained: "restrained",
  stunned: "stunned",
  unconscious: "unconscious",
};

const CONDITION_DESC: Record<string, string> = {
  blinded: "You can't see and automatically fail checks requiring sight. Attacks against you have advantage, your attacks disadvantage.",
  charmed: "You can't attack the charmer or target them with harmful effects. The charmer has advantage on social checks against you.",
  deafened: "You can't hear and automatically fail checks requiring hearing.",
  exhaustion: "Measured in levels; each adds penalties to checks and speed, and the highest level means death.",
  frightened: "While you can see the source you have disadvantage on checks and attacks, and can't willingly move closer to it.",
  grappled: "Your speed is 0; you can't move.",
  incapacitated: "You can't take actions or reactions.",
  invisible: "Attacks against you have disadvantage, your attacks advantage.",
  paralyzed: "Incapacitated; you can't move or speak. Melee hits against you are automatic critical hits.",
  petrified: "Incapacitated, with resistance to all damage and immunity to poison and disease.",
  poisoned: "Disadvantage on attack rolls and ability checks.",
  prone: "You can only crawl and attack at disadvantage. Melee attacks against you have advantage, ranged disadvantage.",
  restrained: "Speed 0, disadvantage on attacks and Dexterity saves. Attacks against you have advantage.",
  stunned: "Incapacitated, can't move, and can speak only haltingly. Attacks against you have advantage.",
  unconscious: "Incapacitated and unaware; you drop what you hold and fall prone. Melee hits against you are critical.",
};

const DAMAGE: Record<string, string> = {
  acid: "acid",
  bludgeoning: "bludgeoning",
  cold: "cold",
  fire: "fire",
  force: "force",
  lightning: "lightning",
  necrotic: "necrotic",
  piercing: "piercing",
  poison: "poison",
  psychic: "psychic",
  radiant: "radiant",
  slashing: "slashing",
  thunder: "thunder",
};

const DAMAGE_DESC: Record<string, string> = {
  acid: "Corrosive damage from acids, caustics and the breath of some monsters.",
  bludgeoning: "Blunt force — clubs, falls, crushing and constriction.",
  cold: "Frost and freezing chill; slows and makes brittle.",
  fire: "The heat of flame and explosions.",
  force: "Pure magical energy; few creatures resist it.",
  lightning: "Electrical discharges and bolts.",
  necrotic: "The withering of life and the dark energy of the undead.",
  piercing: "Puncturing wounds — arrows, spears, fangs.",
  poison: "Poisons and toxins; many creatures resist them.",
  psychic: "An assault on the mind that leaves no visible wound.",
  radiant: "Radiant, holy energy of light.",
  slashing: "Cutting wounds — swords, axes, claws.",
  thunder: "A deafening concussive blast of sound.",
};

const SKILL: Record<string, string> = {
  athletics: "Athletics",
  acrobatics: "Acrobatics",
  "sleight-of-hand": "Sleight of Hand",
  stealth: "Stealth",
  arcana: "Arcana",
  history: "History",
  investigation: "Investigation",
  nature: "Nature",
  religion: "Religion",
  "animal-handling": "Animal Handling",
  insight: "Insight",
  medicine: "Medicine",
  perception: "Perception",
  survival: "Survival",
  deception: "Deception",
  intimidation: "Intimidation",
  performance: "Performance",
  persuasion: "Persuasion",
};

const SKILL_DESC: Record<string, string> = {
  athletics: "Climbing, jumping, swimming and grappling — physically overcoming obstacles (Strength).",
  acrobatics: "Balance, tumbling and nimble dodges on unsteady footing (Dexterity).",
  "sleight-of-hand": "Pickpocketing, juggling and subtle manual tricks (Dexterity).",
  stealth: "Sneaking, hiding and moving silently to go unnoticed (Dexterity).",
  arcana: "Knowledge of magic, spells, runes and arcane beings (Intelligence).",
  history: "Knowledge of history, wars, rulers and ancient civilizations (Intelligence).",
  investigation: "Finding clues, deduction and solving puzzles (Intelligence).",
  nature: "Knowledge of nature, plants, animals and weather (Intelligence).",
  religion: "Knowledge of deities, rites, cults and the undead (Intelligence).",
  "animal-handling": "Calming, training and understanding animals (Wisdom).",
  insight: "Detecting lies, moods and the true intentions of others (Wisdom).",
  medicine: "Stabilizing the dying and diagnosing illness (Wisdom).",
  perception: "Noticing your surroundings by sight, sound and smell (Wisdom).",
  survival: "Tracking, finding your way and surviving in the wild (Wisdom).",
  deception: "Convincing lies, pretense and misdirection (Charisma).",
  intimidation: "Coercing obedience through threats and pressure (Charisma).",
  performance: "Entertaining an audience with music, dance and showmanship (Charisma).",
  persuasion: "Winning others over with tact and argument (Charisma).",
};

const SPELL_SCHOOL: Record<string, string> = {
  abjuration: "abjuration",
  conjuration: "conjuration",
  divination: "divination",
  enchantment: "enchantment",
  evocation: "evocation",
  illusion: "illusion",
  necromancy: "necromancy",
  transmutation: "transmutation",
};

const SPELL_SCHOOL_DESC: Record<string, string> = {
  abjuration: "Protective magic: shields, barriers and dispelling other spells.",
  conjuration: "Summoning creatures and objects, or teleporting at a distance.",
  divination: "Revealing truth, the hidden and the future.",
  enchantment: "Influencing the mind — charms, commands and deception.",
  evocation: "Channeling the elements into destructive energy (fire, lightning, cold).",
  illusion: "Deceptions of the senses — images, sounds and false perceptions.",
  necromancy: "Magic of life and death, the undead and draining vitality.",
  transmutation: "Transforming the substance of things, creatures and matter.",
};

const RACE: Record<string, string> = {
  human: "Human",
  elf: "Elf",
  dwarf: "Dwarf",
  halfling: "Halfling",
  "half-orc": "Half-Orc",
  "half-elf": "Half-Elf",
  tiefling: "Tiefling",
  dragonborn: "Dragonborn",
  gnome: "Gnome",
};

const SUBRACE: Record<string, string> = {
  "hill-dwarf": "Hill Dwarf",
  "mountain-dwarf": "Mountain Dwarf",
  "high-elf": "High Elf",
  "wood-elf": "Wood Elf",
  "dark-elf": "Dark Elf (Drow)",
  "lightfoot-halfling": "Lightfoot Halfling",
  "stout-halfling": "Stout Halfling",
  "rock-gnome": "Rock Gnome",
  "forest-gnome": "Forest Gnome",
};

const CLASS_NAME: Record<string, string> = {
  fighter: "Fighter",
  barbarian: "Barbarian",
  rogue: "Rogue",
  monk: "Monk",
  ranger: "Ranger",
  paladin: "Paladin",
  cleric: "Cleric",
  druid: "Druid",
  wizard: "Wizard",
  sorcerer: "Sorcerer",
  bard: "Bard",
  warlock: "Warlock",
};

const FEAT: Record<string, string> = {
  alert: "Alert",
  "great-weapon-master": "Great Weapon Master",
  lucky: "Lucky",
  "magic-initiate": "Magic Initiate",
  "war-caster": "War Caster",
  resilient: "Resilient",
  tough: "Tough",
  sentinel: "Sentinel",
  sharpshooter: "Sharpshooter",
  grappler: "Grappler",
};

const WEAPON_PROPERTY: Record<string, string> = {
  ammunition: "ammunition",
  finesse: "finesse",
  heavy: "heavy",
  light: "light",
  loading: "loading",
  range: "range",
  reach: "reach",
  special: "special",
  thrown: "thrown",
  "two-handed": "two-handed",
  versatile: "versatile",
};

const WEAPON_PROPERTY_DESC: Record<string, string> = {
  ammunition: "A ranged attack expends ammunition (arrow, bolt, stone).",
  finesse: "Use either Strength or Dexterity for the attack and damage.",
  heavy: "Small creatures wield it with disadvantage.",
  light: "Suited for two-weapon fighting (off-hand attack as a bonus action).",
  loading: "You can fire it only once per action, bonus action or reaction.",
  range: "Has two ranges; beyond the near you attack at disadvantage, beyond the far not at all.",
  reach: "Reaches 5 feet farther than normal.",
  special: "Has its own special rule (see the weapon's description).",
  thrown: "You can throw it; it uses the same ability as the melee attack.",
  "two-handed": "You must use two hands to attack with it.",
  versatile: "Can be used one- or two-handed (larger damage die two-handed).",
};

const ALIGNMENT: Record<string, string> = {
  "lawful-good": "lawful good",
  "neutral-good": "neutral good",
  "chaotic-good": "chaotic good",
  "lawful-neutral": "lawful neutral",
  neutral: "neutral",
  "true-neutral": "true neutral",
  "chaotic-neutral": "chaotic neutral",
  "lawful-evil": "lawful evil",
  "neutral-evil": "neutral evil",
  "chaotic-evil": "chaotic evil",
  unaligned: "unaligned",
};

const AOE: Record<string, string> = {
  sphere: "sphere",
  cube: "cube",
  cone: "cone",
  line: "line",
};

const QUEST_STATUS: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  failed: "Failed",
};

const UI: Record<string, string> = {
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.close": "Close",
  "common.back": "Back",
  "common.continue": "Continue",
  "common.loading": "Loading…",
  "settings.language.ui": "Interface language",
  "settings.language.terms": "Game terms language",
  "settings.language.stats": "Ability scores language",
};

export const EN: LabelBundle = {
  ability: ABILITY,
  abilityAbbr: ABILITY_ABBR,
  abilityDesc: ABILITY_DESC,
  condition: CONDITION,
  conditionDesc: CONDITION_DESC,
  damage: DAMAGE,
  damageDesc: DAMAGE_DESC,
  skill: SKILL,
  skillDesc: SKILL_DESC,
  spellSchool: SPELL_SCHOOL,
  spellSchoolDesc: SPELL_SCHOOL_DESC,
  race: RACE,
  subrace: SUBRACE,
  className: CLASS_NAME,
  feat: FEAT,
  weaponProperty: WEAPON_PROPERTY,
  weaponPropertyDesc: WEAPON_PROPERTY_DESC,
  alignment: ALIGNMENT,
  aoe: AOE,
  questStatus: QUEST_STATUS,
  // Long-tail names read fine prettified from the SRD id; left empty on purpose.
  spellName: {},
  itemName: {},
  ui: UI,
};
