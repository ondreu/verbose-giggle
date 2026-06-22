import { promises as fs } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { LlmClient, type Llm } from "../llm/client.js";
import { MockLlmClient } from "../llm/mock.js";
import { resolveAiTurns, runRecap, runTurn } from "../session/loop.js";
import { startEncounter } from "../session/encounter.js";
import type { EventBus } from "../session/events.js";
import type { SessionManager } from "../session/manager.js";
import type { Config } from "../config.js";

export interface GameContext {
  manager: SessionManager;
  bus: EventBus;
  config: Config;
}

export async function registerGameRoutes(app: FastifyInstance, ctx: GameContext): Promise<void> {
  // Fall back to the offline mock narrator when no API key is configured, so
  // the full loop + UI run without secrets (set LLM_PROVIDER=mock to force it).
  const useMock = !ctx.config.llm.apiKey || process.env.LLM_PROVIDER === "mock";
  const llm: Llm = useMock
    ? new MockLlmClient(() => {
        const actors = ctx.manager.campaign.actors;
        const alive = (id: string) => (ctx.manager.session.actors[id]?.hp?.current ?? 1) > 0;
        const friendly = new Set(["party", "ally"]);
        return {
          activePlayer: ctx.manager.session.active_player,
          partyIds: Object.values(actors)
            .filter((a) => friendly.has(a.faction))
            .map((a) => a.id),
          hostileIds: Object.values(actors)
            .filter((a) => a.faction === "hostile" && alive(a.id))
            .map((a) => a.id),
          inCombat: ctx.manager.session.combat !== null,
          enemyOf: (actorId: string) => {
            const self = actors[actorId];
            if (!self) return null;
            const wantHostile = friendly.has(self.faction);
            const target = Object.values(actors).find(
              (a) =>
                a.id !== actorId &&
                alive(a.id) &&
                (wantHostile ? a.faction === "hostile" : friendly.has(a.faction)),
            );
            return target?.id ?? null;
          },
        };
      })
    : new LlmClient(ctx.config);
  if (useMock) app.log.warn("LLM_API_KEY not set — using offline mock narrator");

  /** Full scene + state snapshot for initial client hydration. */
  app.get("/api/state", async () => ({
    campaign: ctx.manager.campaign.config,
    session: ctx.manager.session,
    actors: ctx.manager.campaign.actors,
    locations: ctx.manager.campaign.locations,
    encounters: ctx.manager.campaign.encounters,
  }));

  /** Instantiate an authored encounter into live combat, then auto-resolve AI. */
  app.post<{ Params: { id: string } }>("/api/encounter/:id", async (req, reply) => {
    const gs = ctx.manager.buildGameState();
    const before = ctx.manager.session.log.length;
    const res = await startEncounter(ctx.manager, gs, req.params.id);
    if (!res.ok) return reply.code(400).send({ error: res.error });
    for (const entry of ctx.manager.session.log.slice(before)) {
      ctx.bus.emit({ type: "log", entry });
    }
    await ctx.manager.checkpoint(gs);
    ctx.bus.emit({ type: "state", state: ctx.manager.session });
    await resolveAiTurns({ manager: ctx.manager, llm, bus: ctx.bus, gs });
    return res;
  });

  /** Serve a campaign asset (map images, etc.), path-confined to the campaign. */
  app.get<{ Params: { "*": string } }>("/api/asset/*", async (req, reply) => {
    const rel = req.params["*"] ?? "";
    const base = path.resolve(ctx.manager.campaign.dir);
    const target = path.resolve(base, rel);
    // Confine to the campaign dir and to image assets only (never notes/state).
    if (!target.startsWith(base + path.sep)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const types: Record<string, string> = {
      ".webp": "image/webp",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".gif": "image/gif",
    };
    const ext = path.extname(target).toLowerCase();
    if (!(ext in types)) return reply.code(404).send({ error: "not an image" });
    try {
      const data = await fs.readFile(target);
      reply.header("Content-Type", types[ext]!);
      reply.header("Cache-Control", "public, max-age=3600");
      return reply.send(data);
    } catch {
      return reply.code(404).send({ error: "not found" });
    }
  });

  /** Generate a "previously on…" recap of the story so far (§6.6). */
  app.post("/api/recap", async (_req, reply) => {
    try {
      return await runRecap({ manager: ctx.manager, llm, bus: ctx.bus });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** The append-only human-readable session diary (handoff/inspection, §6.6). */
  app.get("/api/log", async () => {
    const file = path.join(ctx.manager.campaign.dir, "state", "session-log.md");
    try {
      const text = await fs.readFile(file, "utf8");
      return { exists: true, text };
    } catch {
      return { exists: false, text: "" };
    }
  });

  /** Read-only: cells the actor can reach this turn (for grid highlighting). */
  app.get<{ Params: { actor: string } }>("/api/reachable/:actor", async (req) => {
    const gs = ctx.manager.buildGameState();
    const result = await ctx.manager.applyTool(gs, "reachable", { actor: req.params.actor });
    return result.ok ? result.result : { cells: [], budget: 0 };
  });

  /** Player free-text action → the LLM/engine turn loop. */
  app.post<{ Body: { input: string } }>("/api/action", async (req, reply) => {
    const input = (req.body?.input ?? "").trim();
    if (!input) return reply.code(400).send({ error: "empty input" });
    try {
      const { narration } = await runTurn({ manager: ctx.manager, llm, bus: ctx.bus, input });
      return { narration };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.bus.emit({ type: "error", message });
      return reply.code(500).send({ error: message });
    }
  });

  /** Direct engine command (UI buttons: move token, cast spell, etc.) — no LLM. */
  app.post<{ Body: { tool: string; args: unknown } }>("/api/command", async (req, reply) => {
    const { tool, args } = req.body ?? { tool: "", args: {} };
    if (!tool) return reply.code(400).send({ error: "missing tool" });
    const gs = ctx.manager.buildGameState();
    const before = ctx.manager.session.log.length;
    const result = await ctx.manager.applyTool(gs, tool, args);
    for (const entry of ctx.manager.session.log.slice(before)) {
      ctx.bus.emit({ type: "log", entry });
    }
    await ctx.manager.checkpoint(gs);
    ctx.bus.emit({ type: "state", state: ctx.manager.session });
    // If the command (start_combat / next_turn) put an AI actor on point,
    // auto-resolve AI turns until it's a human's turn again (§8.3).
    await resolveAiTurns({ manager: ctx.manager, llm, bus: ctx.bus, gs });
    return result;
  });

  /** SSE stream of game events (§13). */
  app.get("/api/events", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(`event: ready\ndata: {}\n\n`);
    const unsubscribe = ctx.bus.subscribe((event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const keepAlive = setInterval(() => reply.raw.write(`: ping\n\n`), 25000);
    req.raw.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  /** TTS proxy to Piper (§11). Returns audio/wav. */
  app.post<{ Body: { text: string } }>("/api/tts", async (req, reply) => {
    if (!ctx.config.piperUrl) return reply.code(503).send({ error: "TTS not configured" });
    const text = req.body?.text ?? "";
    const upstream = await fetch(`${ctx.config.piperUrl}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!upstream.ok || !upstream.body) {
      return reply.code(502).send({ error: "TTS upstream error" });
    }
    reply.header("Content-Type", "audio/wav");
    return reply.send(Buffer.from(await upstream.arrayBuffer()));
  });
}
