import { z } from "zod";
import {
  Abilities,
  AbilityKey,
  ActiveCondition,
  Position,
  Slug,
} from "./primitives.js";

export const HitDice = z.object({
  type: z.enum(["d6", "d8", "d10", "d12"]),
  total: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});

export const HpBlock = z.object({
  max: z.number().int().nonnegative(),
  current: z.number().int(),
  temp: z.number().int().nonnegative().default(0),
});

export const SpellSlotTier = z.object({
  max: z.number().int().nonnegative(),
  used: z.number().int().nonnegative().default(0),
});

export const InventoryEntry = z.object({
  id: Slug,
  qty: z.number().int().positive().default(1),
  equipped: z.boolean().optional(),
});

export const Concentration = z
  .object({
    spell: z.string(),
    dc_to_maintain: z.number().int().optional(),
  })
  .nullable();

export const DeathSaves = z.object({
  success: z.number().int().min(0).max(3).default(0),
  fail: z.number().int().min(0).max(3).default(0),
});

export const Proficiencies = z.object({
  saves: z.array(AbilityKey).default([]),
  skills: z.array(z.string()).default([]),
  weapons: z.array(z.string()).default([]),
  armor: z.array(z.string()).default([]),
});

/**
 * Unified "actor" schema — the same shape models human PCs, AI companions, and
 * monsters. `controller` and `faction` differentiate them (§6.1).
 *
 * `.passthrough()` preserves unknown/extra frontmatter keys so the app never
 * clobbers a user's notes on write.
 */
export const ActorSchema = z
  .object({
    type: z.enum(["character", "monster"]),
    id: Slug,
    name: z.string(),
    controller: z.enum(["human", "ai"]),
    faction: z.enum(["party", "ally", "hostile", "neutral"]),
    race: z.string().optional(),
    class: z.string().optional(),
    subclass: z.string().optional(),
    /** Optional background id (SRD Backgrounds, #20). */
    background: z.string().optional(),
    /** Free-text character backstory authored at creation (#14). */
    backstory: z.string().optional(),
    level: z.number().int().positive().default(1),
    xp: z.number().int().nonnegative().default(0),
    abilities: Abilities,
    proficiency_bonus: z.number().int().nonnegative().default(2),
    proficiencies: Proficiencies.default({}),
    hp: HpBlock,
    ac: z.number().int(),
    speed: z.number().int().nonnegative().default(30),
    hit_dice: HitDice.optional(),
    spell_slots: z.record(z.string(), SpellSlotTier).default({}),
    spells_known: z.array(z.string()).default([]),
    /** Languages known (SRD ids/labels, #20). */
    languages: z.array(z.string()).default([]),
    /** Class/subclass/race features granted by level (SRD ids, #20). */
    features: z.array(z.string()).default([]),
    /** Feats taken at creation/level-up (SRD ids, #20). */
    feats: z.array(z.string()).default([]),
    conditions: z.array(ActiveCondition).default([]),
    concentration: Concentration.default(null),
    inventory: z.array(InventoryEntry).default([]),
    attunement: z.array(Slug).max(3).default([]),
    death_saves: DeathSaves.default({ success: 0, fail: 0 }),
    /** True once the actor has failed three death saves — permanently dead,
     *  removed from initiative, not recoverable without a specific spell (#23). */
    dead: z.boolean().default(false),
    position: Position.nullable().default(null),
    srd_ref: z.string().nullable().default(null),
    ai_profile: z.string().nullable().default(null),
  })
  .passthrough();

export type Actor = z.infer<typeof ActorSchema>;
