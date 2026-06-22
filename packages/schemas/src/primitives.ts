import { z } from "zod";

/** The six D&D ability scores. */
export const AbilityKey = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
export type AbilityKey = z.infer<typeof AbilityKey>;

export const Abilities = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
});
export type Abilities = z.infer<typeof Abilities>;

/** A grid cell position during combat. */
export const Position = z.object({ x: z.number().int(), y: z.number().int() });
export type Position = z.infer<typeof Position>;

export const DamageType = z.enum([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);
export type DamageType = z.infer<typeof DamageType>;

export const ConditionName = z.enum([
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
]);
export type ConditionName = z.infer<typeof ConditionName>;

/** An active condition on an actor. Duration is in rounds; null = indefinite. */
export const ActiveCondition = z.object({
  name: ConditionName,
  source: z.string().optional(),
  duration: z.number().int().nullable().default(null),
});
export type ActiveCondition = z.infer<typeof ActiveCondition>;

/** A slug id: lowercase, digits, hyphens. */
export const Slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "must be a lowercase slug");
