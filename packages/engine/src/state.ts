import type { Actor, LogEntry, SessionState } from "@adm/schemas";
import type { SrdIndex } from "@adm/srd";
import type { RNG } from "./rng.js";

export interface VariantRules {
  flanking: boolean;
  diagonals: "5-5-5" | "5-10-5";
}

/**
 * The complete state the engine operates on. The engine is a pure function of
 * (GameState, command) → (mutated GameState, result, log entries). It performs
 * NO IO, network, or LLM calls — the server loads actors + session from the
 * vault, hands them here, and flushes durable changes back (§5, §7).
 *
 * `actors` are fully resolved sheets (base note merged with any session
 * overlay). The engine mutates them in place and appends to `session.log`.
 */
export interface GameState {
  actors: Record<string, Actor>;
  session: SessionState;
  srd: SrdIndex;
  rng: RNG;
  variant: VariantRules;
}

export function getActor(state: GameState, id: string): Actor {
  const actor = state.actors[id];
  if (!actor) throw new Error(`Unknown actor: "${id}"`);
  return actor;
}

let logSeq = 0;
/** Append a log entry; returns it so callers can include it in tool results. */
export function log(state: GameState, entry: Omit<LogEntry, "t"> & { t?: string }): LogEntry {
  const full: LogEntry = { t: entry.t ?? new Date().toISOString(), ...entry };
  state.session.log.push(full);
  logSeq++;
  return full;
}

/** Ability modifier from a score: floor((score - 10) / 2). */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Effective AC, accounting for equipped shields already baked into `ac`. */
export function actorAc(actor: Actor): number {
  return actor.ac;
}

export const SKILL_ABILITY: Record<string, keyof Actor["abilities"]> = {
  athletics: "str",
  acrobatics: "dex",
  "sleight-of-hand": "dex",
  stealth: "dex",
  arcana: "int",
  history: "int",
  investigation: "int",
  nature: "int",
  religion: "int",
  "animal-handling": "wis",
  insight: "wis",
  medicine: "wis",
  perception: "wis",
  survival: "wis",
  deception: "cha",
  intimidation: "cha",
  performance: "cha",
  persuasion: "cha",
};
