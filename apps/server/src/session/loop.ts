import { toolSpecs, type GameState } from "@adm/engine";
import type { Llm, ChatMsg } from "../llm/client.js";
import { aiTurnInstruction, ARRIVAL_BEAT, CAMPAIGN_START, RECAP_PROMPT, sceneSnapshot, type SceneConnection, type SceneQuest, SYSTEM_PROMPT } from "../llm/prompt.js";
import type { EventBus } from "./events.js";
import type { SessionManager } from "./manager.js";

/** Authored travel options out of the current location, for the scene snapshot (#24). */
function sceneConnections(manager: SessionManager): SceneConnection[] {
  const here = manager.campaign.locations[manager.session.current_location];
  return (here?.connections ?? []).map((c) => ({
    to: c.to,
    days: c.travel?.days,
    hours: (c.travel as { hours?: number } | undefined)?.hours,
  }));
}

/** Authored quests the world offers, for grounding quest_start ids (#19). */
function availableQuests(manager: SessionManager): SceneQuest[] {
  return Object.values(manager.campaign.quests).map((q) => ({ id: q.id, title: q.title }));
}

const MAX_TOOL_ROUNDS = 8; // turn budget to avoid loops (§9.2)
const HISTORY_WINDOW = 20;
const MAX_AI_TURNS = 30; // safety cap on consecutive auto-resolved AI turns

/**
 * Shared function-calling core (§9.2): given a seeded message list, let the LLM
 * narrate and request tools, execute each tool deterministically in the engine,
 * feed results back, and repeat until the model produces final narration. All
 * state changes flow through the engine; the LLM never writes state directly.
 * Streams new dice-log entries to clients as they happen.
 */
async function executeToolLoop(opts: {
  manager: SessionManager;
  llm: Llm;
  bus: EventBus;
  gs: GameState;
  messages: ChatMsg[];
}): Promise<string> {
  const { manager, llm, bus, gs, messages } = opts;
  const specs = toolSpecs();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await llm.chat(messages, specs);

    if (resp.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: resp.content,
        tool_calls: resp.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      const beforeLen = manager.session.log.length;
      for (const call of resp.toolCalls) {
        bus.emit({ type: "thinking", tool: call.name });
        const result = await manager.applyTool(gs, call.name, call.args);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.name,
          content: JSON.stringify(result),
        });
      }
      for (const entry of manager.session.log.slice(beforeLen)) {
        bus.emit({ type: "log", entry });
      }
      continue;
    }

    return resp.content ?? "";
  }
  return "";
}

/** Lists of opposing / friendly faction members alive in the scene. */
function factionLists(manager: SessionManager, gs: GameState, actorId: string) {
  const self = gs.actors[actorId];
  const friendly = new Set(["party", "ally"]);
  const alive = (id: string) => (gs.actors[id]?.hp.current ?? 0) > 0;
  const isEnemy = (faction: string) =>
    self && friendly.has(self.faction) ? faction === "hostile" : friendly.has(faction);
  const enemies: string[] = [];
  const allies: string[] = [];
  for (const a of Object.values(gs.actors)) {
    if (a.id === actorId || !alive(a.id)) continue;
    if (isEnemy(a.faction)) enemies.push(a.id);
    else if (self && a.faction === self.faction) allies.push(a.id);
  }
  return { enemies, allies };
}

/**
 * Player free-text turn: assemble context, run the loop, persist, then
 * auto-resolve any AI-controlled actors whose turn it now is.
 */
export async function runTurn(opts: {
  manager: SessionManager;
  llm: Llm;
  bus: EventBus;
  input: string;
}): Promise<{ narration: string }> {
  const { manager, llm, bus, input } = opts;
  const gs = manager.buildGameState();

  const recent = manager.session.chat.slice(-HISTORY_WINDOW).map(
    (m): ChatMsg => ({ role: m.role, content: m.content, name: m.name, tool_call_id: m.tool_call_id }),
  );
  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: sceneSnapshot(manager.session, gs.actors, sceneConnections(manager), availableQuests(manager)) },
    ...recent,
    { role: "user", content: input },
  ];
  manager.session.chat.push({ role: "user", content: input });

  const narration = await executeToolLoop({ manager, llm, bus, gs, messages });
  if (narration) {
    manager.session.chat.push({ role: "assistant", content: narration });
    bus.emit({ type: "narration", text: narration });
    await manager.log(`\n**DM:** ${narration}`);
  }

  await manager.checkpoint(gs);
  bus.emit({ type: "state", state: manager.session });

  await resolveAiTurns({ manager, llm, bus, gs });
  return { narration };
}

/**
 * Narrate the opening scene of a fresh campaign and invite the player to act
 * (#31). The caller guards against re-running once there is chat history. The
 * intro text is returned (the client appends it directly, avoiding an SSE race
 * on first load); state changes (e.g. revealed starting location) still emit.
 */
export async function runIntro(opts: {
  manager: SessionManager;
  llm: Llm;
  bus: EventBus;
}): Promise<{ intro: string }> {
  const { manager, llm, bus } = opts;
  const gs = manager.buildGameState();
  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: sceneSnapshot(manager.session, gs.actors, sceneConnections(manager), availableQuests(manager)) },
    { role: "user", content: CAMPAIGN_START },
  ];
  const intro = await executeToolLoop({ manager, llm, bus, gs, messages });
  if (intro) {
    manager.session.chat.push({ role: "assistant", content: intro });
    await manager.log(`\n**DM (úvod):** ${intro}`);
  }
  await manager.checkpoint(gs);
  bus.emit({ type: "state", state: manager.session });
  return { intro };
}

/**
 * Narrate the party's arrival at a location (#41b). Called after a `travel`
 * command resolves — the DM describes the new place and invites the player to
 * act. Mirrored after `runIntro` but fires on every travel, not just once.
 */
export async function runArrival(opts: {
  manager: SessionManager;
  llm: Llm;
  bus: EventBus;
}): Promise<{ narration: string }> {
  const { manager, llm, bus } = opts;
  const gs = manager.buildGameState();
  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: sceneSnapshot(manager.session, gs.actors, sceneConnections(manager), availableQuests(manager)) },
    { role: "user", content: ARRIVAL_BEAT },
  ];
  const narration = await executeToolLoop({ manager, llm, bus, gs, messages });
  if (narration) {
    manager.session.chat.push({ role: "assistant", content: narration });
    bus.emit({ type: "narration", text: narration });
    await manager.log(`\n**DM (příjezd):** ${narration}`);
  }
  await manager.checkpoint(gs);
  bus.emit({ type: "state", state: manager.session });
  return { narration };
}

/**
 * Generate a "previously on…" recap from the recent story (§6.6 /recap). Pure
 * narration: no tools, no state mutation — just retells what happened.
 */
export async function runRecap(opts: {
  manager: SessionManager;
  llm: Llm;
  bus: EventBus;
}): Promise<{ recap: string }> {
  const { manager, llm, bus } = opts;
  const transcript = manager.session.chat
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-16)
    .map((m) => `${m.role === "assistant" ? "DM" : "Hráč"}: ${m.content}`)
    .join("\n");
  const events = manager.session.log
    .filter((l) => ["combat", "travel", "death-save"].includes(l.kind))
    .slice(-8)
    .map((l) => `- ${l.detail}`)
    .join("\n");

  const messages: ChatMsg[] = [
    { role: "system", content: RECAP_PROMPT },
    {
      role: "user",
      content: `[RECAP] Lokace: ${manager.session.current_location}.\n\nKlíčové události:\n${events || "—"}\n\nPřepis:\n${transcript || "(zatím nic)"}`,
    },
  ];
  const resp = await llm.chat(messages, []);
  const recap = resp.content ?? "";
  if (recap) {
    bus.emit({ type: "narration", text: recap });
    await manager.log(`\n_Shrnutí:_ ${recap}`);
  }
  return { recap };
}

/** Run a single AI-controlled actor's turn through the engine tools (§8.3). */
async function runAiTurn(opts: {
  manager: SessionManager;
  llm: Llm;
  bus: EventBus;
  gs: GameState;
  actorId: string;
}): Promise<void> {
  const { manager, llm, bus, gs, actorId } = opts;
  const actor = gs.actors[actorId];
  if (!actor) return;
  bus.emit({ type: "actor_turn", actor: actorId, name: actor.name, controller: "ai" });
  const { enemies, allies } = factionLists(manager, gs, actorId);

  // Include recent chat history so the LLM has combat context when narrating.
  const recent = manager.session.chat.slice(-HISTORY_WINDOW).map(
    (m): ChatMsg => ({ role: m.role, content: m.content, name: m.name, tool_call_id: m.tool_call_id }),
  );
  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: sceneSnapshot(manager.session, gs.actors) },
    ...recent,
    { role: "user", content: aiTurnInstruction(actor, enemies, allies) },
  ];

  const narration = await executeToolLoop({ manager, llm, bus, gs, messages });
  if (narration) {
    manager.session.chat.push({ role: "assistant", content: narration });
    bus.emit({ type: "narration", text: narration });
    await manager.log(`\n**DM (${actor.name}):** ${narration}`);
  }
}

/**
 * Auto-resolve consecutive AI-controlled turns until it is a human's turn (or
 * combat ends). Dead actors are skipped. The human only acts on their own turn;
 * the active-player pointer drives everything (§8.3, §12 hotseat UX).
 */
export async function resolveAiTurns(opts: {
  manager: SessionManager;
  llm: Llm;
  bus: EventBus;
  gs: GameState;
}): Promise<void> {
  const { manager, llm, bus, gs } = opts;

  for (let i = 0; i < MAX_AI_TURNS; i++) {
    // The campaign has reached a terminal state (e.g. party wipe, #23): stop.
    if (manager.session.ending) return;
    const combat = manager.session.combat;
    if (!combat) return;
    const activeId = combat.order[combat.turn_index]?.actor;
    if (!activeId) return;
    const actor = manager.campaign.actors[activeId];
    if (!actor || actor.controller === "human") return;

    const alive = (gs.actors[activeId]?.hp.current ?? 0) > 0;
    const logBefore = manager.session.log.length;
    if (alive) {
      await runAiTurn({ manager, llm, bus, gs, actorId: activeId });
    }
    // Only advance the turn if the LLM didn't already call next_turn itself
    // (the system prompt tells the LLM to always call it, so we must detect the
    // duplicate to avoid skipping two turns at once).
    const nextTurnCalled = manager.session.log.slice(logBefore).some((l) => l.tool === "next_turn");
    if (!nextTurnCalled) {
      await manager.applyTool(gs, "next_turn", {});
    }
    await manager.checkpoint(gs);
    bus.emit({ type: "state", state: manager.session });
  }
}
