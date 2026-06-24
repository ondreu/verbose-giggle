import { z } from "zod";
import { Position, Slug } from "./primitives.js";

export const TravelEdge = z.object({
  to: Slug,
  travel: z
    .object({
      distance_km: z.number().optional(),
      days: z.number().optional(),
      terrain: z.string().optional(),
      danger: z.enum(["low", "medium", "high"]).optional(),
    })
    .default({}),
});

/** Overworld point-crawl node + hierarchy (§6.2). */
export const LocationSchema = z
  .object({
    type: z.literal("location"),
    id: Slug,
    name: z.string(),
    kind: z.enum([
      "continent",
      "region",
      "city",
      "town",
      "village",
      "landmark",
      "dungeon",
    ]),
    parent: Slug.nullable().default(null),
    coords: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .optional(),
    map_image: z.string().optional(),
    connections: z.array(TravelEdge).default([]),
    encounter_table: z.string().optional(),
    discovered: z.boolean().default(false),
  })
  .passthrough();
export type Location = z.infer<typeof LocationSchema>;

export const TerrainCell = z.object({
  x: z.number().int(),
  y: z.number().int(),
  kind: z.enum([
    "wall",
    "difficult",
    "hazard",
    "cover-half",
    "cover-three-quarter",
  ]),
});

export const Spawn = z.object({
  ref: Slug,
  faction: z.enum(["party", "ally", "hostile", "neutral"]).default("hostile"),
  at: Position,
});

/** Tactical grid encounter setup (§6.3). */
export const EncounterSchema = z
  .object({
    type: z.literal("encounter"),
    id: Slug,
    name: z.string(),
    location: Slug.optional(),
    grid: z.object({
      w: z.number().int().positive(),
      h: z.number().int().positive(),
      cell_ft: z.number().int().positive().default(5),
    }),
    battle_map_image: z.string().optional(),
    terrain: z.array(TerrainCell).default([]),
    spawns: z.array(Spawn).default([]),
    party_start: z.array(Position).default([]),
  })
  .passthrough();
export type Encounter = z.infer<typeof EncounterSchema>;

/** Homebrew/magic item (SRD equipment comes from the SRD dataset) (§6.4). */
export const ItemSchema = z
  .object({
    type: z.literal("item"),
    id: Slug,
    name: z.string(),
    category: z.string(),
    weight: z.number().nonnegative().optional(),
    properties: z.array(z.string()).default([]),
    damage: z.string().optional(),
    ac: z.number().int().optional(),
    effects: z.array(z.string()).default([]),
    attunement: z.boolean().default(false),
  })
  .passthrough();
export type Item = z.infer<typeof ItemSchema>;

/** Campaign config (§6.5). */
export const CampaignSchema = z
  .object({
    type: z.literal("campaign"),
    name: z.string(),
    ruleset: z.string().default("dnd5e-srd"),
    /** Shared living world this campaign plays out in (#49a). Resolves to
     *  `<vault>/worlds/<world>/`; its locations/factions/NPCs/lore merge under
     *  the campaign's own (campaign content wins on id collision). Omit for a
     *  self-contained campaign (backward compatible). */
    world: Slug.optional(),
    /** Per-campaign toggle for living-world state (#49). When true, this
     *  campaign reads and writes the world's SHARED live state
     *  (`worlds/<world>/state/world.json`), so faction progress / events carry
     *  across campaigns in the same world — one can affect another. When false
     *  (default) each campaign keeps its OWN isolated copy in its session, seeded
     *  from the authored notes. No effect without `world`. */
    world_shared: z.boolean().default(false),
    world_map: z.string().optional(),
    starting_location: Slug,
    party: z.array(Slug).default([]),
    companions: z.array(Slug).default([]),
    language: z.string().default("cs"),
    tts: z
      .object({ enabled: z.boolean().default(true), voice: z.string().optional() })
      .default({ enabled: true }),
    llm: z.object({ model: z.string().optional() }).default({}),
    variant_rules: z
      .object({
        flanking: z.boolean().default(false),
        diagonals: z.enum(["5-5-5", "5-10-5"]).default("5-5-5"),
        grid_shape: z.enum(["square", "hex"]).default("hex"),
      })
      .default({}),
  })
  .passthrough();
export type Campaign = z.infer<typeof CampaignSchema>;
