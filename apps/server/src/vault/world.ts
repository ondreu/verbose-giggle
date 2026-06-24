import path from "node:path";
import {
  FactionSchema,
  LocationSchema,
  NpcSchema,
  WorldEventSchema,
  type Faction,
  type Location,
  type Npc,
  type WorldEvent,
} from "@adm/schemas";
import { listNotes, readNote } from "./notes.js";

/**
 * A shared world loaded from `<vault>/worlds/<name>/` (#49a). The world exists
 * independently of any campaign; a campaign that names it (`campaign.yaml` →
 * `world:`) gets its locations/factions/NPCs/lore merged in. Everything here is
 * authored template data — live progress lives in the session overlay.
 */
export interface LoadedWorld {
  dir: string;
  name: string;
  locations: Record<string, Location>;
  factions: Record<string, Faction>;
  npcs: Record<string, Npc>;
  worldEvents: Record<string, WorldEvent>;
  lore: Record<string, { id: string; name: string; body: string }>;
}

/** Normalise a YAML-parsed consequence entry to a `"key: value"` string. */
function normalizeConsequences(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") out.push(item);
    // `- location.x.danger: high` parses to a single-key object — flatten it.
    else if (item && typeof item === "object") {
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        out.push(`${k}: ${String(v)}`);
      }
    }
  }
  return out;
}

/** Where a world lives, given the vault root and the campaign's `world:` slug. */
export function worldDir(vaultRoot: string, world: string): string {
  return path.join(vaultRoot, "worlds", world);
}

/** Load a world folder into memory. Tolerant of missing subfolders. */
export async function loadWorld(dir: string, name: string): Promise<LoadedWorld> {
  const world: LoadedWorld = {
    dir,
    name,
    locations: {},
    factions: {},
    npcs: {},
    worldEvents: {},
    lore: {},
  };

  for (const file of await listNotes(path.join(dir, "locations"))) {
    const note = await readNote(file);
    const parsed = LocationSchema.safeParse(note.data);
    if (parsed.success) world.locations[parsed.data.id] = parsed.data;
    else console.warn(`[world] skipping invalid location ${file}: ${parsed.error.message}`);
  }

  for (const file of await listNotes(path.join(dir, "factions"))) {
    const note = await readNote(file);
    const parsed = FactionSchema.safeParse({ type: "faction", ...(note.data as object) });
    if (parsed.success) world.factions[parsed.data.id] = parsed.data;
    else console.warn(`[world] skipping invalid faction ${file}: ${parsed.error.message}`);
  }

  for (const file of await listNotes(path.join(dir, "npcs"))) {
    const note = await readNote(file);
    const parsed = NpcSchema.safeParse({ type: "npc", ...(note.data as object) });
    if (parsed.success) world.npcs[parsed.data.id] = parsed.data;
    else console.warn(`[world] skipping invalid npc ${file}: ${parsed.error.message}`);
  }

  // World events live under lore/events/; free lore notes under lore/.
  for (const file of await listNotes(path.join(dir, "lore", "events"))) {
    const note = await readNote(file);
    const data = note.data as Record<string, unknown>;
    const parsed = WorldEventSchema.safeParse({
      type: "world_event",
      ...data,
      consequences: normalizeConsequences(data.consequences),
    });
    if (parsed.success) world.worldEvents[parsed.data.id] = parsed.data;
    else console.warn(`[world] skipping invalid world event ${file}: ${parsed.error.message}`);
  }

  for (const file of await listNotes(path.join(dir, "lore"))) {
    const note = await readNote<{ id?: string; name?: string }>(file);
    const id = note.data.id ?? path.basename(file, ".md");
    world.lore[id] = { id, name: note.data.name ?? id, body: note.body };
  }

  return world;
}
