import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  ActorSchema,
  CampaignSchema,
  EncounterSchema,
  FactionSchema,
  ItemSchema,
  LocationSchema,
  NpcSchema,
  QuestSchema,
  SessionState,
  type Actor,
  type Campaign,
  type Encounter,
  type Faction,
  type FactionRuntime,
  type Item,
  type Location,
  type Npc,
  type Quest,
  type WorldEvent,
} from "@adm/schemas";
import { listNotes, readNote, writeNote, type Note } from "./notes.js";
import { loadWorld, worldDir, type LoadedWorld } from "./world.js";

export interface LoadedCampaign {
  dir: string;
  config: Campaign;
  actors: Record<string, Actor>;
  /** Where each actor note lives, for write-back. */
  actorFiles: Record<string, string>;
  locations: Record<string, Location>;
  encounters: Record<string, Encounter>;
  items: Record<string, Item>;
  /** Authored quest templates (`quests/*.md`, #19); live progress is in session. */
  quests: Record<string, Quest>;
  /** Free lore notes (factions, quests) for narration grounding (§6). */
  lore: Record<string, { id: string; name: string; body: string }>;
  /** Authored factions (campaign + merged world, #49); live progress in session. */
  factions: Record<string, Faction>;
  /** Gazetteer NPCs from the shared world (#49). */
  npcs: Record<string, Npc>;
  /** Authored world events from the shared world (#49). */
  worldEvents: Record<string, WorldEvent>;
  /** The shared world this campaign plays in, when `config.world` is set (#49a). */
  world: LoadedWorld | null;
}

async function loadActorsFrom(dir: string): Promise<{ actors: Actor[]; files: Record<string, string> }> {
  const actors: Actor[] = [];
  const files: Record<string, string> = {};
  for (const file of await listNotes(dir)) {
    const note = await readNote(file);
    const parsed = ActorSchema.safeParse(note.data);
    if (parsed.success) {
      actors.push(parsed.data);
      files[parsed.data.id] = file;
    } else {
      console.warn(`[vault] skipping invalid actor ${file}: ${parsed.error.message}`);
    }
  }
  return { actors, files };
}

/** Load a complete campaign folder into memory (§6). */
export async function loadCampaign(campaignDir: string): Promise<LoadedCampaign> {
  const configRaw = await fs.readFile(path.join(campaignDir, "campaign.yaml"), "utf8");
  const config = CampaignSchema.parse({ type: "campaign", ...YAML.parse(configRaw) });

  const actors: Record<string, Actor> = {};
  const actorFiles: Record<string, string> = {};
  for (const sub of ["characters", "companions", "bestiary"]) {
    const { actors: list, files } = await loadActorsFrom(path.join(campaignDir, sub));
    for (const a of list) {
      actors[a.id] = a;
      actorFiles[a.id] = files[a.id]!;
    }
  }

  const locations: Record<string, Location> = {};
  for (const file of await listNotes(path.join(campaignDir, "locations"))) {
    const note = await readNote(file);
    const parsed = LocationSchema.safeParse(note.data);
    if (parsed.success) locations[parsed.data.id] = parsed.data;
  }

  const encounters: Record<string, Encounter> = {};
  for (const file of await listNotes(path.join(campaignDir, "encounters"))) {
    const note = await readNote(file);
    const parsed = EncounterSchema.safeParse(note.data);
    if (parsed.success) encounters[parsed.data.id] = parsed.data;
  }

  const items: Record<string, Item> = {};
  for (const file of await listNotes(path.join(campaignDir, "items"))) {
    const note = await readNote(file);
    const parsed = ItemSchema.safeParse(note.data);
    if (parsed.success) items[parsed.data.id] = parsed.data;
    else console.warn(`[vault] skipping invalid item ${file}: ${parsed.error.message}`);
  }

  const quests: Record<string, Quest> = {};
  for (const file of await listNotes(path.join(campaignDir, "quests"))) {
    const note = await readNote(file);
    const parsed = QuestSchema.safeParse({ type: "quest", ...(note.data as object) });
    if (parsed.success) quests[parsed.data.id] = parsed.data;
    else console.warn(`[vault] skipping invalid quest ${file}: ${parsed.error.message}`);
  }

  const lore: LoadedCampaign["lore"] = {};
  for (const file of await listNotes(path.join(campaignDir, "lore"))) {
    const note = await readNote<{ id?: string; name?: string }>(file);
    const id = note.data.id ?? path.basename(file, ".md");
    lore[id] = { id, name: note.data.name ?? id, body: note.body };
  }

  // Load the shared world (#49a) and merge it UNDER the campaign: world content
  // is the baseline, campaign notes override on id collision. A campaign without
  // `world:` is unchanged (backward compatible). The vault root is two levels up
  // from the campaign folder (`<vault>/campaigns/<folder>`).
  let world: LoadedWorld | null = null;
  const factions: Record<string, Faction> = {};
  const npcs: Record<string, Npc> = {};
  const worldEvents: Record<string, WorldEvent> = {};
  if (config.world) {
    const vaultRoot = path.dirname(path.dirname(campaignDir));
    try {
      world = await loadWorld(worldDir(vaultRoot, config.world), config.world);
      Object.assign(locations, world.locations);
      Object.assign(lore, world.lore);
      Object.assign(factions, world.factions);
      Object.assign(npcs, world.npcs);
      Object.assign(worldEvents, world.worldEvents);
    } catch (err) {
      console.warn(`[vault] world "${config.world}" failed to load: ${(err as Error).message}`);
    }
  }

  // Campaign-local factions / NPCs override the world's (so a campaign can recast
  // a faction leader or add its own players in the world).
  for (const file of await listNotes(path.join(campaignDir, "factions"))) {
    const note = await readNote(file);
    const parsed = FactionSchema.safeParse({ type: "faction", ...(note.data as object) });
    if (parsed.success) factions[parsed.data.id] = parsed.data;
    else console.warn(`[vault] skipping invalid faction ${file}: ${parsed.error.message}`);
  }
  for (const file of await listNotes(path.join(campaignDir, "npcs"))) {
    const note = await readNote(file);
    const parsed = NpcSchema.safeParse({ type: "npc", ...(note.data as object) });
    if (parsed.success) npcs[parsed.data.id] = parsed.data;
    else console.warn(`[vault] skipping invalid npc ${file}: ${parsed.error.message}`);
  }

  return {
    dir: campaignDir,
    config,
    actors,
    actorFiles,
    locations,
    encounters,
    items,
    quests,
    lore,
    factions,
    npcs,
    worldEvents,
    world,
  };
}

/** Seed live faction runtime from authored faction notes (#49). */
export function seedFactions(c: LoadedCampaign): Record<string, FactionRuntime> {
  const seeded: Record<string, FactionRuntime> = {};
  for (const f of Object.values(c.factions)) {
    seeded[f.id] = {
      id: f.id,
      name: f.name,
      resources: f.resources,
      relationships: { ...f.relationships },
      progress: f.progress,
    };
  }
  return seeded;
}

const sessionPath = (dir: string) => path.join(dir, "state", "session.json");

/** Load the live session state, or seed a fresh one from the campaign config. */
export async function loadSession(c: LoadedCampaign): Promise<SessionState> {
  try {
    const raw = await fs.readFile(sessionPath(c.dir), "utf8");
    return SessionState.parse(JSON.parse(raw));
  } catch {
    const seeded: SessionState = {
      campaign: c.config.name,
      current_location: c.config.starting_location,
      revealed_locations: [c.config.starting_location],
      time: { day: 1, hour: 8 },
      active_player: c.config.party[0] ?? null,
      camp: [],
      actors: {},
      combat: null,
      log: [],
      chat: [],
      quests: {},
      factions: seedFactions(c),
      world_events: {},
      location_danger: {},
      ending: null,
    };
    return SessionState.parse(seeded);
  }
}

export async function saveSession(c: LoadedCampaign, state: SessionState): Promise<void> {
  const file = sessionPath(c.dir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/** Flush durable actor changes back to its note, preserving body + unknown keys. */
export async function flushActor(c: LoadedCampaign, actor: Actor): Promise<void> {
  const file = c.actorFiles[actor.id];
  if (!file) return;
  let body = "";
  try {
    const existing = await readNote(file);
    body = existing.body;
  } catch {
    /* new note */
  }
  const note: Note = { filePath: file, data: actor as unknown as Record<string, unknown>, body };
  await writeNote(note);
}

/** Append a line to the human-readable session diary (§6, /recap & handoff). */
export async function appendSessionLog(c: LoadedCampaign, line: string): Promise<void> {
  const file = path.join(c.dir, "state", "session-log.md");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${line}\n`, "utf8");
}

/** Path to the campaign's growing chronicle — the "book of the adventure" (#5). */
export function chroniclePath(c: LoadedCampaign): string {
  return path.join(c.dir, "state", "chronicle.md");
}

/**
 * Append a finished session as a new chapter of the campaign chronicle (#5).
 * Each call adds one dated chapter, so the file accumulates into a readable
 * book of everything the party has lived through.
 */
export async function appendChronicle(
  c: LoadedCampaign,
  chapter: { heading: string; body: string },
): Promise<void> {
  const file = chroniclePath(c);
  await fs.mkdir(path.dirname(file), { recursive: true });
  let prefix = "";
  try {
    await fs.access(file);
  } catch {
    // First chapter: open the book with a title page.
    prefix = `# Kronika — ${c.config.name}\n\n`;
  }
  await fs.appendFile(file, `${prefix}## ${chapter.heading}\n\n${chapter.body.trim()}\n\n`, "utf8");
}
