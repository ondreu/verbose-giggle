import { z } from "zod";
import { Slug } from "./primitives.js";

/**
 * The living-world layer (#49). A `world` exists independently of any campaign:
 * factions pursue their own goals, NPCs inhabit shared locations, and world
 * events fire from faction progress. Campaigns are stories that play out inside
 * a world (`campaign.yaml` → `world:`). Authored notes are templates; live
 * progress lives in the session overlay and is mutated only through engine tools
 * (the same determinism contract as HP/quests, #12/#19).
 */

/** How much a faction can bring to bear. Coarse on purpose — narrative, not a budget. */
export const FactionResource = z.enum(["low", "medium", "high"]);
export type FactionResource = z.infer<typeof FactionResource>;

/** Stance one faction holds toward another (or toward the party). */
export const FactionStance = z.enum([
  "allied",
  "friendly",
  "neutral",
  "unfriendly",
  "hostile",
]);
export type FactionStance = z.infer<typeof FactionStance>;

/** Authored faction note (`factions/<id>.md`, #49b). Body = flavour the DM cites. */
export const FactionSchema = z
  .object({
    type: z.literal("faction"),
    id: Slug,
    name: z.string(),
    /** What it is: guild, order, cult, house, warband, company… (flavour/grouping). */
    kind: z.string().default("faction"),
    /** The faction's driving ambition — what `progress` measures distance to. */
    goal: z.string(),
    resources: FactionResource.default("medium"),
    /** Locations the faction holds sway over (slugs). */
    territory: z.array(Slug).default([]),
    /** NPC id of the faction's leader, when one is authored. */
    leader: Slug.nullable().default(null),
    /** Location id of the faction's seat of power. */
    headquarters: Slug.nullable().default(null),
    /** Stance toward other factions, keyed by faction id. */
    relationships: z.record(z.string(), FactionStance).default({}),
    /** 0.0–1.0: how close the faction is to achieving `goal`. */
    progress: z.number().min(0).max(1).default(0),
  })
  .passthrough();
export type Faction = z.infer<typeof FactionSchema>;

/**
 * Live faction state tracked in the session (#49c). Seeded from the authored
 * note when the world loads; mutated only through `faction_advance` /
 * `faction_relation`, so every shift hits the visible dice log.
 */
export const FactionRuntime = z.object({
  id: Slug,
  name: z.string(),
  resources: FactionResource,
  relationships: z.record(z.string(), FactionStance).default({}),
  progress: z.number().min(0).max(1),
});
export type FactionRuntime = z.infer<typeof FactionRuntime>;

/**
 * Authored world event (`lore/events/<id>.md`, #49b). `trigger` is human-readable
 * (the DM judges when it fires); `consequences` are structured strings the engine
 * applies deterministically when the event is triggered, e.g.
 * `"location.ricni-brod.danger: high"`, `"faction.kupecky-cech.progress: -0.1"`.
 */
export const WorldEventSchema = z
  .object({
    type: z.literal("world_event"),
    id: Slug,
    name: z.string(),
    trigger: z.string().optional(),
    consequences: z.array(z.string()).default([]),
  })
  .passthrough();
export type WorldEvent = z.infer<typeof WorldEventSchema>;

/** Disposition of a gazetteer NPC toward strangers/the party, by default. */
export const NpcDisposition = z.enum([
  "hostile",
  "wary",
  "neutral",
  "friendly",
  "helpful",
]);
export type NpcDisposition = z.infer<typeof NpcDisposition>;

/**
 * Lightweight gazetteer NPC (`npcs/<id>.md`, #49). Not a combat actor — these
 * populate the world with named people the DM can ground narration on (a
 * shopkeep, a guild master, a captain). When one needs to fight, the DM resolves
 * stats from `srd_ref` or an authored actor note; until then this is just who
 * they are, where they are, and what they want. Body = description/secrets.
 */
export const NpcSchema = z
  .object({
    type: z.literal("npc"),
    id: Slug,
    name: z.string(),
    /** Honorific / role line, e.g. "cechmistr kupeckého cechu". */
    title: z.string().optional(),
    race: z.string().optional(),
    occupation: z.string().optional(),
    /** Where the NPC is usually found. */
    location: Slug.nullable().default(null),
    /** Faction the NPC belongs to, if any. */
    faction: Slug.nullable().default(null),
    disposition: NpcDisposition.default("neutral"),
    /** Optional SRD stat block to use if the NPC ends up in combat. */
    srd_ref: z.string().nullable().default(null),
  })
  .passthrough();
export type Npc = z.infer<typeof NpcSchema>;
