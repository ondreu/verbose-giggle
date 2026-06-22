import { z } from "zod";
import { ActiveCondition, Position, Slug } from "./primitives.js";

/** A single dice/event log entry — the auditable trust surface (§8.4). */
export const LogEntry = z.object({
  t: z.string(), // ISO timestamp
  kind: z.string(), // attack | check | save | damage | heal | move | ...
  actor: z.string().optional(),
  target: z.string().optional(),
  detail: z.string(), // human-readable, e.g. "d20: 14 +5 = 19 vs AC 15 → hit"
  tool: z.string().optional(),
  result: z.unknown().optional(),
});
export type LogEntry = z.infer<typeof LogEntry>;

export const ChatMessage = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/** Runtime overlay of mutable actor state (§7). */
export const ActorOverlay = z.object({
  hp: z.object({ current: z.number().int(), temp: z.number().int().optional() }).optional(),
  position: Position.nullable().optional(),
  conditions: z.array(ActiveCondition).optional(),
  concentration: z
    .object({ spell: z.string(), dc_to_maintain: z.number().int().optional() })
    .nullable()
    .optional(),
  /** Persisted death flag so a fallen hero stays dead across reloads (#23). */
  dead: z.boolean().optional(),
});
export type ActorOverlay = z.infer<typeof ActorOverlay>;

export const CombatState = z.object({
  encounter: Slug.optional(),
  round: z.number().int().positive().default(1),
  order: z.array(z.object({ actor: z.string(), initiative: z.number().int() })),
  turn_index: z.number().int().nonnegative().default(0),
  grid: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    cell_ft: z.number().int().positive(),
    /** Grid topology: square (8-neighbour) or hex (odd-r, 6-neighbour) (#6b). */
    shape: z.enum(["square", "hex"]).default("square"),
  }),
  tokens: z.record(z.string(), Position).default({}),
  /** Static terrain for this encounter (walls, difficult, hazards, cover). */
  terrain: z
    .array(z.object({ x: z.number().int(), y: z.number().int(), kind: z.string() }))
    .default([]),
  /** Action economy budget for the actor whose turn it is. */
  budget: z
    .object({
      action: z.boolean(),
      bonus: z.boolean(),
      reaction: z.boolean(),
      movement: z.number().int().nonnegative(),
    })
    .optional(),
});
export type CombatState = z.infer<typeof CombatState>;

/** Server-authoritative session state, persisted to session.json (§7). */
export const SessionState = z.object({
  campaign: z.string(),
  current_location: Slug,
  revealed_locations: z.array(Slug).default([]),
  time: z.object({ day: z.number().int(), hour: z.number().int() }).default({ day: 1, hour: 8 }),
  active_player: z.string().nullable().default(null),
  actors: z.record(z.string(), ActorOverlay).default({}),
  combat: CombatState.nullable().default(null),
  log: z.array(LogEntry).default([]),
  chat: z.array(ChatMessage).default([]),
  /** Set when the campaign reaches a terminal state (e.g. the party is wiped
   *  out, #23). The UI shows a game-over screen and offers a rollback. */
  ending: z
    .object({ reason: z.string(), actor: z.string().optional() })
    .nullable()
    .default(null),
});
export type SessionState = z.infer<typeof SessionState>;
