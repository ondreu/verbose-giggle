import { z } from "zod";

/** Minimal SRD monster stat block. Mirrors 5e-bits/5e-database fields we use. */
export const SrdMonster = z.object({
  id: z.string(),
  name: z.string(),
  size: z.string().optional(),
  type: z.string().optional(),
  alignment: z.string().optional(),
  ac: z.number().int(),
  hp: z.number().int(),
  hit_dice: z.string().optional(), // e.g. "2d6"
  speed: z.number().int().default(30),
  abilities: z.object({
    str: z.number().int(),
    dex: z.number().int(),
    con: z.number().int(),
    int: z.number().int(),
    wis: z.number().int(),
    cha: z.number().int(),
  }),
  proficiency_bonus: z.number().int().default(2),
  cr: z.number().optional(),
  resistances: z.array(z.string()).default([]),
  immunities: z.array(z.string()).default([]),
  vulnerabilities: z.array(z.string()).default([]),
  actions: z
    .array(
      z.object({
        name: z.string(),
        attack_bonus: z.number().int().optional(),
        reach_ft: z.number().int().optional(),
        damage: z.string().optional(), // e.g. "1d6+2"
        damage_type: z.string().optional(),
      }),
    )
    .default([]),
});
export type SrdMonster = z.infer<typeof SrdMonster>;

export const SrdSpell = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().int().min(0).max(9),
  school: z.string().optional(),
  casting_time: z.string().optional(),
  range_ft: z.number().int().optional(),
  concentration: z.boolean().default(false),
  ritual: z.boolean().default(false),
  attack: z.enum(["melee", "ranged", "none"]).default("none"),
  save: z
    .object({ ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]), effect: z.string() })
    .optional(),
  damage: z.string().optional(),
  damage_type: z.string().optional(),
  /** Damage dice keyed by slot level the spell is cast at (leveled spells). */
  damage_by_slot: z.record(z.string(), z.string()).optional(),
  /** Damage dice keyed by caster level (cantrip scaling). */
  damage_by_level: z.record(z.string(), z.string()).optional(),
  /** Healing dice keyed by slot level (e.g. Cure Wounds); spell mod added by the engine. */
  heal_by_slot: z.record(z.string(), z.string()).optional(),
  /** Area of effect, for grounding/narration. */
  aoe: z.object({ shape: z.string(), size: z.number().int() }).optional(),
  description: z.string().optional(),
  /** Class ids whose spell list this spell appears on (for pickers, #20). */
  classes: z.array(z.string()).default([]),
});
export type SrdSpell = z.infer<typeof SrdSpell>;

export const SrdEquipment = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  weight: z.number().nonnegative().default(0),
  cost: z.string().optional(),
  damage: z.string().optional(),
  damage_type: z.string().optional(),
  properties: z.array(z.string()).default([]),
  ac: z.number().int().optional(),
  range_ft: z.number().int().optional(),
});
export type SrdEquipment = z.infer<typeof SrdEquipment>;

const Ability = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

/** A race (#20) — ability bonuses, speed, starting languages, trait ids. */
export const SrdRace = z.object({
  id: z.string(),
  name: z.string(),
  speed: z.number().int().default(30),
  size: z.string().optional(),
  ability_bonuses: z.record(Ability, z.number().int()).default({}),
  languages: z.array(z.string()).default([]),
  traits: z.array(z.string()).default([]),
  subraces: z.array(z.string()).default([]),
});
export type SrdRace = z.infer<typeof SrdRace>;

export const SrdSubrace = z.object({
  id: z.string(),
  name: z.string(),
  race: z.string().optional(), // parent race id
  ability_bonuses: z.record(Ability, z.number().int()).default({}),
  traits: z.array(z.string()).default([]),
  description: z.string().optional(),
});
export type SrdSubrace = z.infer<typeof SrdSubrace>;

export const SrdClass = z.object({
  id: z.string(),
  name: z.string(),
  hit_die: z.number().int().default(8),
  saving_throws: z.array(Ability).default([]),
  proficiencies: z.array(z.string()).default([]),
  spellcasting_ability: Ability.optional(),
  subclasses: z.array(z.string()).default([]),
});
export type SrdClass = z.infer<typeof SrdClass>;

export const SrdSubclass = z.object({
  id: z.string(),
  name: z.string(),
  class: z.string().optional(), // parent class id
  flavor: z.string().optional(),
  description: z.string().optional(),
});
export type SrdSubclass = z.infer<typeof SrdSubclass>;

/** A class/subclass feature granted at a level (#20 → leveling #13). */
export const SrdFeature = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().int().optional(),
  class: z.string().optional(),
  subclass: z.string().optional(),
  description: z.string().optional(),
});
export type SrdFeature = z.infer<typeof SrdFeature>;

/** A racial trait (#20). */
export const SrdTrait = z.object({
  id: z.string(),
  name: z.string(),
  races: z.array(z.string()).default([]),
  subraces: z.array(z.string()).default([]),
  description: z.string().optional(),
});
export type SrdTrait = z.infer<typeof SrdTrait>;

export const SrdFeat = z.object({
  id: z.string(),
  name: z.string(),
  prerequisites: z.array(z.string()).default([]),
  description: z.string().optional(),
});
export type SrdFeat = z.infer<typeof SrdFeat>;

export const SrdMagicItem = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  rarity: z.string().optional(),
  description: z.string().optional(),
});
export type SrdMagicItem = z.infer<typeof SrdMagicItem>;

export const SrdProficiency = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  classes: z.array(z.string()).default([]),
  races: z.array(z.string()).default([]),
});
export type SrdProficiency = z.infer<typeof SrdProficiency>;

export const SrdLanguage = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  typical_speakers: z.array(z.string()).default([]),
  script: z.string().optional(),
});
export type SrdLanguage = z.infer<typeof SrdLanguage>;
