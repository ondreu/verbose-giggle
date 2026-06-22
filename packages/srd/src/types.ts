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
  description: z.string().optional(),
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
