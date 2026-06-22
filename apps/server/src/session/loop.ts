import { toolSpecs, type GameState } from "@adm/engine";
import type { Llm, ChatMsg } from "../llm/client.js";
import { aiTurnInstruction, sceneSnapshot, SYSTEM_PROMPT } from "../llm/prompt.js";
import type { EventBus } from "./events.js";
import type { SessionManager } from "./manager.js";

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
    { role: "system", content: sceneSnapshot(manager.session, gs.actors) },
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
  const { enemies, allies } = factionLists(manager, gs, actorId);

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: sceneSnapshot(manager.session, gs.actors) },
    { role: "user", content: aiTurnInstruction(actor, enemies, allies) },
  ];

  const narration = await executeToolLoop({ manager, llm, bus, gs, messages });
  if (narration) {
    manager.session.chat.push({ role: "assistant", content: narration });
    bus.emit({ type: "narration", text: narration });
    await manager.log(`\n**${actor.name} (AI):** ${narration}`);
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
    const combat = manager.session.combat;
    if (!combat) return;
    const activeId = combat.order[combat.turn_index]?.actor;
    if (!activeId) return;
    const actor = manager.campaign.actors[activeId];
    if (!actor || actor.controller === "human") return;

    const alive = (gs.actors[activeId]?.hp.current ?? 0) > 0;
    if (alive) {
      await runAiTurn({ manager, llm, bus, gs, actorId: activeId });
    }
    // Advance past this AI actor (whether it acted or was down).
    await manager.applyTool(gs, "next_turn", {});
    await manager.checkpoint(gs);
    bus.emit({ type: "state", state: manager.session });
  }
}
