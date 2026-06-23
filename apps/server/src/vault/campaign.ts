import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  ActorSchema,
  CampaignSchema,
  EncounterSchema,
  ItemSchema,
  LocationSchema,
  QuestSchema,
  SessionState,
  type Actor,
  type Campaign,
  type Encounter,
  type Item,
  type Location,
  type Quest,
} from "@adm/schemas";
import { listNotes, readNote, writeNote, type Note } from "./notes.js";

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

  return { dir: campaignDir, config, actors, actorFiles, locations, encounters, items, quests, lore };
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
      actors: {},
      combat: null,
      log: [],
      chat: [],
      quests: {},
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
