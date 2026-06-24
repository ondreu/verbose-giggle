import type { SrdEquipment, SrdMonster, SrdOverrides, SrdSpell } from "@adm/srd";

/**
 * A tiny SRD subset used as the default fixture for the pure-engine tests.
 *
 * The engine package has no IO, so it can't load the bundled JSON dataset
 * (`packages/srd/data`, mounted by the server). These inline records give the
 * engine tests stable goblins/spells/weapons to exercise rules against without
 * a dataset. (Previously this lived in `@adm/srd/src/data.ts`; it moved here
 * when that runtime-redundant bundle was removed — the server now always loads
 * the full bundled dataset.) SRD 5.1, CC-BY-4.0.
 */
export const FIXTURE_MONSTERS: Record<string, SrdMonster> = {
  goblin: {
    id: "goblin",
    name: "Goblin",
    size: "Small",
    type: "humanoid",
    ac: 15,
    hp: 7,
    hit_dice: "2d6",
    speed: 30,
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    proficiency_bonus: 2,
    cr: 0.25,
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    actions: [
      { name: "Scimitar", attack_bonus: 4, reach_ft: 5, damage: "1d6+2", damage_type: "slashing" },
    ],
    special_abilities: [],
    legendary_actions: [],
    reactions: [],
  },
  "goblin-boss": {
    id: "goblin-boss",
    name: "Goblin Boss",
    size: "Small",
    type: "humanoid",
    ac: 17,
    hp: 21,
    hit_dice: "6d6",
    speed: 30,
    abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 8, cha: 10 },
    proficiency_bonus: 2,
    cr: 1,
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    actions: [
      { name: "Scimitar", attack_bonus: 4, reach_ft: 5, damage: "1d6+2", damage_type: "slashing" },
    ],
    special_abilities: [],
    legendary_actions: [],
    reactions: [],
  },
};

export const FIXTURE_SPELLS: Record<string, SrdSpell> = {
  "fire-bolt": {
    id: "fire-bolt",
    name: "Fire Bolt",
    level: 0,
    school: "evocation",
    range_ft: 120,
    concentration: false,
    ritual: false,
    attack: "ranged",
    damage: "1d10",
    damage_type: "fire",
    description: "A mote of fire streaks toward a target.",
    classes: ["sorcerer", "wizard"],
  },
  "cure-wounds": {
    id: "cure-wounds",
    name: "Cure Wounds",
    level: 1,
    school: "evocation",
    range_ft: 5,
    concentration: false,
    ritual: false,
    attack: "none",
    damage: "1d8",
    damage_type: "radiant",
    description: "A creature you touch regains hit points.",
    classes: ["bard", "cleric", "druid", "paladin", "ranger"],
  },
};

export const FIXTURE_EQUIPMENT: Record<string, SrdEquipment> = {
  longsword: {
    id: "longsword",
    name: "Longsword",
    category: "martial-melee",
    weight: 3,
    damage: "1d8",
    damage_type: "slashing",
    properties: ["versatile"],
  },
  "chain-mail": {
    id: "chain-mail",
    name: "Chain Mail",
    category: "heavy-armor",
    weight: 55,
    ac: 16,
    properties: [],
  },
  shield: { id: "shield", name: "Shield", category: "shield", weight: 6, ac: 2, properties: [] },
  "potion-of-healing": {
    id: "potion-of-healing",
    name: "Potion of Healing",
    category: "potion",
    weight: 0.5,
    properties: ["consumable"],
  },
};

/** The default SRD overrides for engine tests: the inline fixture subset. */
export const FIXTURE_OVERRIDES: SrdOverrides = {
  monsters: FIXTURE_MONSTERS,
  spells: FIXTURE_SPELLS,
  equipment: FIXTURE_EQUIPMENT,
};
