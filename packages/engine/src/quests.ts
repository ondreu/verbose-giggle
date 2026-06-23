import type { QuestObjective, QuestRuntime } from "@adm/schemas";
import { log, type GameState } from "./state.js";

/**
 * Deterministic quest tracking (#19). Quest progress lives in the session
 * overlay (`session.quests`) and is mutated ONLY through these pure helpers, so
 * every start/advance/complete/fail lands in the visible dice log — the LLM
 * never edits quest state as free text. The DM loop calls them when narration
 * implies a state change; the audit trail is the log, like every other mutation.
 */

function getQuests(state: GameState): Record<string, QuestRuntime> {
  // SessionState schema defaults this, but guard for hand-built states/tests.
  if (!state.session.quests) state.session.quests = {};
  return state.session.quests;
}

export interface StartQuestArgs {
  id: string;
  title: string;
  giver?: string;
  objectives?: { id: string; text: string }[];
}

/** Begin a quest (idempotent re-start is refused so progress isn't wiped). */
export function startQuest(state: GameState, args: StartQuestArgs) {
  const quests = getQuests(state);
  if (quests[args.id]) {
    throw new Error(`Úkol „${args.id}" už byl zahájen.`);
  }
  const objectives: QuestObjective[] = (args.objectives ?? []).map((o) => ({
    id: o.id,
    text: o.text,
    done: false,
  }));
  const quest: QuestRuntime = {
    id: args.id,
    title: args.title,
    giver: args.giver,
    status: "active",
    objectives,
  };
  quests[args.id] = quest;
  log(state, {
    kind: "quest",
    detail: `Nový úkol: „${quest.title}"`,
    tool: "quest_start",
    result: { id: quest.id },
  });
  return quest;
}

/** Tick a single objective as done. No-op (logged) if already done. */
export function advanceQuest(state: GameState, args: { id: string; objective: string }) {
  const quest = getQuests(state)[args.id];
  if (!quest) throw new Error(`Neznámý úkol: „${args.id}".`);
  if (quest.status !== "active") throw new Error(`Úkol „${quest.title}" už není aktivní.`);
  const obj = quest.objectives.find((o) => o.id === args.objective);
  if (!obj) throw new Error(`Úkol „${quest.title}" nemá cíl „${args.objective}".`);
  if (obj.done) {
    return { quest, objective: obj, alreadyDone: true };
  }
  obj.done = true;
  const remaining = quest.objectives.filter((o) => !o.done).length;
  log(state, {
    kind: "quest",
    detail: `Úkol „${quest.title}" → cíl „${obj.text}" splněn${
      remaining === 0 ? " (všechny cíle hotové)" : ` (zbývá ${remaining})`
    }.`,
    tool: "quest_advance",
    result: { id: quest.id, objective: obj.id, remaining },
  });
  return { quest, objective: obj, alreadyDone: false, remaining };
}

/** Resolve a quest as completed or failed. */
function resolveQuest(state: GameState, id: string, status: "completed" | "failed", tool: string) {
  const quest = getQuests(state)[id];
  if (!quest) throw new Error(`Neznámý úkol: „${id}".`);
  if (quest.status !== "active") throw new Error(`Úkol „${quest.title}" už není aktivní.`);
  quest.status = status;
  log(state, {
    kind: "quest",
    detail: status === "completed" ? `Úkol splněn: „${quest.title}"` : `Úkol nezdařen: „${quest.title}"`,
    tool,
    result: { id: quest.id, status },
  });
  return quest;
}

export function completeQuest(state: GameState, args: { id: string }) {
  return resolveQuest(state, args.id, "completed", "quest_complete");
}

export function failQuest(state: GameState, args: { id: string }) {
  return resolveQuest(state, args.id, "failed", "quest_fail");
}
