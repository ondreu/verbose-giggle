import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { FactionResource, FactionRuntime, type SessionState } from "@adm/schemas";

/**
 * Shared living-world state (#49). When a campaign opts in with
 * `world_shared: true`, the live faction progress / triggered world events /
 * location danger persist HERE — `<vault>/worlds/<name>/state/world.json` —
 * instead of (only) the campaign's own session. That makes the world common
 * across campaigns: what one party changes, the next inherits. Campaigns with
 * `world_shared: false` (default) keep their own isolated copy in their session.
 */
export const WorldStateSchema = z.object({
  factions: z.record(z.string(), FactionRuntime).default({}),
  world_events: z.record(z.string(), z.object({ triggered: z.boolean() })).default({}),
  location_danger: z.record(z.string(), FactionResource).default({}),
});
export type WorldState = z.infer<typeof WorldStateSchema>;

const statePath = (worldDir: string) => path.join(worldDir, "state", "world.json");

/** Load the shared world state for a world dir, or null if none persisted yet. */
export async function loadWorldState(worldDir: string): Promise<WorldState | null> {
  try {
    const raw = await fs.readFile(statePath(worldDir), "utf8");
    return WorldStateSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist the shared world state atomically (temp file + rename). */
export async function saveWorldState(worldDir: string, state: WorldState): Promise<void> {
  const file = statePath(worldDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(WorldStateSchema.parse(state), null, 2), "utf8");
  await fs.rename(tmp, file);
}

/** Extract the world-state slice (factions / events / danger) from a session. */
export function worldStateFromSession(session: SessionState): WorldState {
  return {
    factions: session.factions ?? {},
    world_events: session.world_events ?? {},
    location_danger: session.location_danger ?? {},
  };
}
