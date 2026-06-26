import { approachStep, gridDistanceFt, toolSpecs, type GameState } from "@adm/engine";
import type { Llm, ChatMsg } from "../llm/client.js";
import { aiTurnInstruction, ARRIVAL_BEAT, CAMPAIGN_START, CAMPAIGN_START_SANDBOX, CHRONICLE_PROMPT, type EnemyRange, RECAP_PROMPT, sceneSnapshot, type SceneConnection, type SceneQuest, type SceneWorld, SYSTEM_PROMPT, turnControlNote } from "../llm/prompt.js";
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

/** Authored faction goals + offerable world events, for grounding world tools (#49). */
function sceneWorld(manager: SessionManager): SceneWorld | undefined {
  const factionGoals = Object.fromEntries(
    Object.values(manager.campaign.factions).map((f) => [f.id, f.goal]),
  );
  const events = Object.values(manager.campaign.worldEvents).map((e) => ({
    id: e.id,
    name: e.name,
    trigger: e.trigger,
  }));
  if (Object.keys(factionGoals).length === 0 && events.length === 0) return undefined;
  return { factionGoals, events };
}

/** Sandbox-mode flag for the scene snapshot (#sandbox). */
function sceneOpts(manager: SessionManager): { sandbox?: boolean } {
  return { sandbox: manager.campaign.config.sandbox === true };
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
  /** Stream the final answer token-by-token to the client (#32). Default true. */
  stream?: boolean;
}): Promise<{ narration: string; thinking: string }> {
  const { manager, llm, bus, gs, messages, stream = true } = opts;
  const specs = toolSpecs();

  // Accumulate the raw token stream across every round (incl. discarded
  // tool-round preamble) so it can be persisted with the turn for the
  // per-message "thinking" view, surviving a reload (#1). Mirrors the marker the
  // client inserts on a discard so the persisted text matches the live stream.
  let thinking = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Stream content tokens as they arrive. We don't yet know whether this
    // round is the final answer or a tool-call round, so any streamed text from
    // a tool-call round is retracted with `narration_discard` below.
    let streamed = false;
    const onDelta = stream
      ? (delta: string) => {
          streamed = true;
          thinking += delta;
          bus.emit({ type: "narration_delta", text: delta });
        }
      : undefined;
    const resp = await llm.chat(messages, specs, onDelta);

    if (resp.toolCalls.length > 0) {
      // The streamed text (if any) was preamble, not the final answer: drop it.
      if (streamed) {
        thinking += "\n— ⟨zahozeno: model volá nástroj⟩ —\n";
        bus.emit({ type: "narration_discard" });
      }
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
      // Persist the committed engine state after every tool round, not just at
      // the end of the turn. A slow narration can run long enough to trip a
      // reverse-proxy gateway timeout (Cloudflare 524), aborting the request
      // before the final checkpoint — without this, combat progress already
      // applied and streamed to the player would be lost on reload (#1/#3).
      // saveSession is an atomic temp-file rename, so a frequent call is safe.
      await manager.persist();
      continue;
    }

    return { narration: resp.content ?? "", thinking: thinking.trim() };
  }
  return { narration: "", thinking: thinking.trim() };
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
 * Engine-computed distance (ft) from `actorId` to each enemy, so an AI actor
 * can decide move-vs-attack without doing grid math itself (#2). Falls back to
 * a null distance when there's no grid/positions.
 */
function enemyRanges(gs: GameState, actorId: string, enemies: string[]): EnemyRange[] {
  const c = gs.session.combat;
  const from = c?.tokens[actorId] ?? gs.actors[actorId]?.position ?? null;
  return enemies.map((id) => {
    const to = c?.tokens[id] ?? gs.actors[id]?.position ?? null;
    const distFt =
      c && from && to ? gridDistanceFt(from, to, c.grid.cell_ft, c.grid.shape, gs.variant.diagonals) : null;
    // When out of melee reach, precompute the cell to step to so the AI moves
    // straight there instead of swinging from range first (#combat AI).
    const step = c && distFt !== null && distFt > 5 ? approachStep(gs, { actor: actorId, target: id }) : null;
    return { id, distFt, approach: step?.to ?? null };
  });
}

/**
 * The authoritative active-turn directive for the LLM, sourced from the
 * initiative pointer (the same source the UI turn tracker reads) so the model
 * can never disagree with the screen about whose turn it is (#1). Returns null
 * outside combat.
 */
function turnControlMessage(manager: SessionManager, gs: GameState): ChatMsg | null {
  const c = gs.session.combat;
  const activeId = c?.order[c.turn_index]?.actor;
  if (!activeId) return null;
  const actor = gs.actors[activeId] ?? manager.campaign.actors[activeId];
  const controller = manager.campaign.actors[activeId]?.controller === "ai" ? "ai" : "human";
  return { role: "system", content: turnControlNote(activeId, actor?.name ?? activeId, controller) };
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
  /** Out-of-combat: treat the input as spoken by the whole party, not one PC (#47). */
  partyVoice?: boolean;
}): Promise<{ narration: string }> {
  const { manager, llm, bus, input } = opts;
  const gs = manager.buildGameState();

  // In combat, announce the active actor (from the initiative pointer) so the
  // client's turn banner is driven by the same server signal on a human's turn,
  // not only on AI turns (#1).
  const combat = gs.session.combat;
  const activeId = combat?.order[combat.turn_index]?.actor;
  if (activeId) {
    const a = gs.actors[activeId] ?? manager.campaign.actors[activeId];
    const controller = manager.campaign.actors[activeId]?.controller === "ai" ? "ai" : "human";
    bus.emit({ type: "actor_turn", actor: activeId, name: a?.name ?? activeId, controller });
  }

  const recent = manager.session.chat.slice(-HISTORY_WINDOW).map(
    (m): ChatMsg => ({ role: m.role, content: m.content, name: m.name, tool_call_id: m.tool_call_id }),
  );
  const turnNote = turnControlMessage(manager, gs);
  // Whole-party voice (#47): a turn-scoped cue so the DM treats this input as
  // coming from the party collectively rather than the single active PC. Only
  // meaningful out of combat — in combat the initiative order owns the turn.
  const partyMembers = Object.values(gs.actors)
    .filter((a) => a.faction === "party")
    .map((a) => a.name)
    .join(", ");
  const partyVoiceNote: ChatMsg | null =
    opts.partyVoice && !combat
      ? {
          role: "system",
          content:
            "Tento pokyn vyslovuje CELÁ DRUŽINA, ne jen aktivní postava. Vztáhni ho na " +
            `všechny členy družiny (${partyMembers || "družina"}), kde to dává smysl, a vyřeš `+
            "případné hody/efekty pro každého dotčeného člena zvlášť přes nástroje.",
        }
      : null;
  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: sceneSnapshot(manager.session, gs.actors, sceneConnections(manager), availableQuests(manager), sceneWorld(manager), sceneOpts(manager)) },
    ...(turnNote ? [turnNote] : []),
    ...(partyVoiceNote ? [partyVoiceNote] : []),
    ...recent,
    { role: "user", content: input },
  ];
  manager.session.chat.push({ role: "user", content: input, t: new Date().toISOString() });

  const { narration, thinking } = await executeToolLoop({ manager, llm, bus, gs, messages });
  if (narration) {
    manager.session.chat.push({ role: "assistant", content: narration, t: new Date().toISOString(), thinking: thinking || undefined });
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
  const sandbox = manager.campaign.config.sandbox === true;
  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: sceneSnapshot(manager.session, gs.actors, sceneConnections(manager), availableQuests(manager), sceneWorld(manager), sceneOpts(manager)) },
    { role: "user", content: sandbox ? CAMPAIGN_START_SANDBOX : CAMPAIGN_START },
  ];
  // No streaming: the intro is returned over HTTP and appended by the client
  // directly (avoiding an SSE race on first load), so streamed deltas would
  // duplicate it.
  const { narration: intro } = await executeToolLoop({ manager, llm, bus, gs, messages, stream: false });
  if (intro) {
    manager.session.chat.push({ role: "assistant", content: intro, t: new Date().toISOString() });
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
    { role: "system", content: sceneSnapshot(manager.session, gs.actors, sceneConnections(manager), availableQuests(manager), sceneWorld(manager), sceneOpts(manager)) },
    { role: "user", content: ARRIVAL_BEAT },
  ];
  const { narration, thinking } = await executeToolLoop({ manager, llm, bus, gs, messages });
  if (narration) {
    manager.session.chat.push({ role: "assistant", content: narration, t: new Date().toISOString(), thinking: thinking || undefined });
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

/**
 * Turn the just-played session into one prose chapter of the campaign chronicle
 * (#5). Pure narration over the whole session transcript + key logged events; no
 * tools, no state mutation. The caller persists the chapter and clears the
 * session for a fresh start.
 */
export async function runChronicle(opts: {
  manager: SessionManager;
  llm: Llm;
}): Promise<{ chapter: string }> {
  const { manager, llm } = opts;
  const transcript = manager.session.chat
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "assistant" ? "DM" : "Hráč"}: ${m.content}`)
    .join("\n");
  const events = manager.session.log
    .filter((l) => ["combat", "attack", "travel", "death-save", "quest", "initiative"].includes(l.kind))
    .map((l) => `- ${l.detail}`)
    .join("\n");
  const partyNames = Object.values(manager.campaign.actors)
    .filter((a) => a.faction === "party")
    .map((a) => a.name)
    .join(", ");

  const messages: ChatMsg[] = [
    { role: "system", content: CHRONICLE_PROMPT },
    {
      role: "user",
      content:
        `Družina: ${partyNames || "—"}. Místo na konci sezení: ${manager.session.current_location}.\n\n` +
        `Klíčové události:\n${events || "—"}\n\nPřepis sezení:\n${transcript || "(prázdné sezení)"}`,
    },
  ];
  const resp = await llm.chat(messages, []);
  return { chapter: resp.content ?? "" };
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
  const ranges = enemyRanges(gs, actorId, enemies);
  const movementFt = gs.session.combat?.budget?.movement ?? actor.speed;

  // Include recent chat history so the LLM has combat context when narrating.
  const recent = manager.session.chat.slice(-HISTORY_WINDOW).map(
    (m): ChatMsg => ({ role: m.role, content: m.content, name: m.name, tool_call_id: m.tool_call_id }),
  );
  const turnNote = turnControlMessage(manager, gs);
  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: sceneSnapshot(manager.session, gs.actors) },
    ...(turnNote ? [turnNote] : []),
    ...recent,
    { role: "user", content: aiTurnInstruction(actor, ranges, allies, movementFt) },
  ];

  const { narration, thinking } = await executeToolLoop({ manager, llm, bus, gs, messages });
  if (narration) {
    manager.session.chat.push({ role: "assistant", content: narration, t: new Date().toISOString(), thinking: thinking || undefined });
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
