import type { FactionResource, FactionRuntime, FactionStance } from "@adm/schemas";
import { log, type GameState } from "./state.js";

/**
 * Deterministic living-world mutation (#49c). Factions, world events and
 * location danger all live in the session overlay and are changed ONLY through
 * these pure helpers, so every shift lands in the visible dice log — the LLM
 * narrates the world moving but never writes its state as free text (same
 * contract as HP/quests, #12/#19). The DM loop calls them when narration implies
 * a faction gained/lost ground, two factions' relations changed, an authored
 * world event came true, or a place grew more/less dangerous.
 */

function getFactions(state: GameState): Record<string, FactionRuntime> {
  if (!state.session.factions) state.session.factions = {};
  return state.session.factions;
}

const RESOURCE_CS: Record<FactionResource, string> = {
  low: "nízké",
  medium: "střední",
  high: "vysoké",
};

const STANCE_CS: Record<FactionStance, string> = {
  allied: "spojenci",
  friendly: "přátelští",
  neutral: "neutrální",
  unfriendly: "nepřátelští",
  hostile: "znepřátelení",
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => `${Math.round(n * 100)} %`;

/** Move a faction toward (or away from) its goal. `delta` in [-1, 1]. */
export function advanceFaction(state: GameState, args: { id: string; delta: number; reason?: string }) {
  const faction = getFactions(state)[args.id];
  if (!faction) throw new Error(`Neznámá frakce: „${args.id}".`);
  const before = faction.progress;
  faction.progress = clamp01(before + args.delta);
  const dir = args.delta >= 0 ? "blíž ke svému cíli" : "dál od svého cíle";
  log(state, {
    kind: "world",
    detail:
      `Frakce „${faction.name}" se posunula ${dir}: ${pct(before)} → ${pct(faction.progress)}` +
      (args.reason ? ` (${args.reason})` : ""),
    tool: "faction_advance",
    result: { id: faction.id, progress: faction.progress, delta: faction.progress - before },
  });
  return { faction, before, after: faction.progress };
}

/** Set the mutual stance between two factions (relationship is symmetric). */
export function setFactionRelation(
  state: GameState,
  args: { a: string; b: string; stance: FactionStance; reason?: string },
) {
  const factions = getFactions(state);
  const fa = factions[args.a];
  const fb = factions[args.b];
  if (!fa) throw new Error(`Neznámá frakce: „${args.a}".`);
  if (!fb) throw new Error(`Neznámá frakce: „${args.b}".`);
  if (args.a === args.b) throw new Error("Frakce nemůže mít vztah sama k sobě.");
  fa.relationships[args.b] = args.stance;
  fb.relationships[args.a] = args.stance;
  log(state, {
    kind: "world",
    detail:
      `Vztah frakcí „${fa.name}" a „${fb.name}" je nyní: ${STANCE_CS[args.stance]}` +
      (args.reason ? ` (${args.reason})` : ""),
    tool: "faction_relation",
    result: { a: args.a, b: args.b, stance: args.stance },
  });
  return { a: fa, b: fb, stance: args.stance };
}

/** Set a location's runtime danger level (fed back into travel/encounter cues). */
export function setLocationDanger(
  state: GameState,
  args: { id: string; level: FactionResource; reason?: string },
) {
  if (!state.session.location_danger) state.session.location_danger = {};
  const before = state.session.location_danger[args.id];
  state.session.location_danger[args.id] = args.level;
  log(state, {
    kind: "world",
    detail:
      `Nebezpečí v lokaci „${args.id}" je nyní ${RESOURCE_CS[args.level]}` +
      (before ? ` (bylo ${RESOURCE_CS[before]})` : "") +
      (args.reason ? ` — ${args.reason}` : ""),
    tool: "location_danger",
    result: { id: args.id, level: args.level },
  });
  return { id: args.id, level: args.level };
}

/**
 * Apply a single structured consequence string from a world event, e.g.
 * `faction.kupecky-cech.progress: -0.1`, `faction.x.resources: low`,
 * `faction.a.relation.b: hostile`, `location.ricni-brod.danger: high`.
 * Unrecognised strings are recorded verbatim in the log (narrative-only).
 */
function applyConsequence(state: GameState, raw: string): void {
  const text = raw.trim();
  const m = /^([a-z0-9.-]+)\s*:\s*(.+)$/i.exec(text);
  if (!m) {
    log(state, { kind: "world", detail: `Důsledek: ${text}`, tool: "world_event_trigger" });
    return;
  }
  const path = m[1]!;
  const value = m[2]!.trim();
  const parts = path.split(".");
  const isLevel = (v: string): v is FactionResource => v === "low" || v === "medium" || v === "high";
  const isStance = (v: string): v is FactionStance =>
    ["allied", "friendly", "neutral", "unfriendly", "hostile"].includes(v);

  try {
    if (parts[0] === "faction" && parts.length === 3 && parts[2] === "progress") {
      const num = Number(value);
      const faction = getFactions(state)[parts[1]!];
      if (faction && !Number.isNaN(num)) {
        // A leading + or - is a delta; a bare number is an absolute target.
        const delta = /^[+-]/.test(value) ? num : num - faction.progress;
        advanceFaction(state, { id: parts[1]!, delta, reason: "důsledek události" });
        return;
      }
    }
    if (parts[0] === "faction" && parts.length === 3 && parts[2] === "resources" && isLevel(value)) {
      const faction = getFactions(state)[parts[1]!];
      if (faction) {
        faction.resources = value;
        log(state, {
          kind: "world",
          detail: `Frakce „${faction.name}" má nyní ${RESOURCE_CS[value]} zdroje.`,
          tool: "world_event_trigger",
          result: { id: faction.id, resources: value },
        });
        return;
      }
    }
    if (parts[0] === "faction" && parts.length === 4 && parts[2] === "relation" && isStance(value)) {
      setFactionRelation(state, { a: parts[1]!, b: parts[3]!, stance: value, reason: "důsledek události" });
      return;
    }
    if (parts[0] === "location" && parts.length === 3 && parts[2] === "danger" && isLevel(value)) {
      setLocationDanger(state, { id: parts[1]!, level: value, reason: "důsledek události" });
      return;
    }
  } catch {
    /* fall through to verbatim logging below */
  }
  log(state, { kind: "world", detail: `Důsledek: ${text}`, tool: "world_event_trigger" });
}

/**
 * Fire an authored world event: record it as triggered (idempotent) and apply
 * its structured consequences. The DM loop enriches the call with the authored
 * `consequences`/`name` from the world note (like `quest_start`, #19).
 */
export function triggerWorldEvent(
  state: GameState,
  args: { id: string; name?: string; consequences?: string[] },
) {
  if (!state.session.world_events) state.session.world_events = {};
  if (state.session.world_events[args.id]?.triggered) {
    throw new Error(`Světová událost „${args.id}" už nastala.`);
  }
  state.session.world_events[args.id] = { triggered: true };
  log(state, {
    kind: "world",
    detail: `Světová událost: „${args.name ?? args.id}"`,
    tool: "world_event_trigger",
    result: { id: args.id },
  });
  for (const c of args.consequences ?? []) applyConsequence(state, c);
  return { id: args.id, triggered: true };
}
