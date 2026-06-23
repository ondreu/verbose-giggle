import { z } from "zod";
import { Slug } from "./primitives.js";

/** Quest lifecycle (#19). `active` once accepted; terminal `completed`/`failed`. */
export const QuestStatus = z.enum(["active", "completed", "failed"]);
export type QuestStatus = z.infer<typeof QuestStatus>;

/** One checkable step of a quest. `done` is ticked via the `quest_advance` tool. */
export const QuestObjective = z.object({
  id: Slug,
  text: z.string(),
  done: z.boolean().default(false),
});
export type QuestObjective = z.infer<typeof QuestObjective>;

/**
 * Authored quest note (`quests/<id>.md`, #19). Frontmatter holds the structured
 * quest; the note body is flavour the DM can cite. Live progress lives in the
 * session overlay (`SessionState.quests`), seeded from this note when started —
 * the note is the template, the session is the playthrough.
 */
export const QuestSchema = z
  .object({
    type: z.literal("quest"),
    id: Slug,
    title: z.string(),
    giver: z.string().optional(),
    status: QuestStatus.default("active"),
    objectives: z.array(QuestObjective).default([]),
  })
  .passthrough();
export type Quest = z.infer<typeof QuestSchema>;

/**
 * Runtime quest state tracked in the session (#19). Mirrors the authored quest
 * minus the note `type`; this is the single source of truth for live progress,
 * mutated only through the engine quest tools so every change hits the dice log.
 */
export const QuestRuntime = z.object({
  id: Slug,
  title: z.string(),
  giver: z.string().optional(),
  status: QuestStatus,
  objectives: z.array(QuestObjective).default([]),
});
export type QuestRuntime = z.infer<typeof QuestRuntime>;
