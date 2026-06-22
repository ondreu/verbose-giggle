import { promises as fs } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { LlmClient, type Llm } from "../llm/client.js";
import { MockLlmClient } from "../llm/mock.js";
import { ImageClient, buildPrompt, type ImageSubject } from "../llm/image.js";
import { resolveAiTurns, runRecap, runTurn } from "../session/loop.js";
import { startEncounter } from "../session/encounter.js";
import type { EventBus } from "../session/events.js";
import type { SessionManager } from "../session/manager.js";
import { applySettings, loadConfig, type Config } from "../config.js";
import { loadSettings, saveSettings, type Settings } from "../settings.js";

export interface GameContext {
  manager: SessionManager;
  bus: EventBus;
  config: Config;
}

export async function registerGameRoutes(app: FastifyInstance, ctx: GameContext): Promise<void> {
  // Effective config and the live narrator are mutable: the settings routes
  // rebuild them in place so changes from the GUI take effect without a
  // restart. Handlers read `config`/`llm` at call time (closure over the
  // binding), so reassignment is picked up everywhere.
  let config = ctx.config;

  /**
   * Build the narrator for the current config. Falls back to the offline mock
   * when no API key is configured (or provider is forced to "mock"), so the
   * full loop + UI run without secrets.
   */
  function makeLlm(): Llm {
    const useMock = !config.llm.apiKey || config.llm.provider === "mock";
    if (!useMock) return new LlmClient(config);
    return new MockLlmClient(() => {
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
    });
  }

  let llm: Llm = makeLlm();
  if (!config.llm.apiKey || config.llm.provider === "mock") {
    app.log.warn("No LLM API key configured — using offline mock narrator");
  }

  // --- Settings (GUI-editable runtime config; §9.1) ------------------------
  /** Campaign folders available for selection (for the settings dropdown). */
  async function listCampaigns(): Promise<string[]> {
    try {
      const root = path.join(config.vaultPath, "campaigns");
      const entries = await fs.readdir(root, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch {
      return [];
    }
  }

  /** Masked view of the effective settings — never leaks secret values. */
  async function settingsView(): Promise<unknown> {
    const stored = await loadSettings(config.vaultPath);
    return {
      llm: {
        baseUrl: config.llm.baseUrl,
        model: config.llm.model,
        provider: config.llm.provider,
        apiKeySet: Boolean(config.llm.apiKey),
      },
      image: {
        enabled: config.image != null,
        baseUrl: config.image?.baseUrl ?? "",
        model: config.image?.model ?? "",
        apiKeySet: Boolean(config.image?.apiKey),
        // The image side reuses the LLM key when no dedicated key is set.
        usesLlmKey: config.image != null && !stored.image?.apiKey,
      },
      srdPath: config.srdPath,
      // The selectable identity is the campaign *folder*, not its display name.
      campaign: stored.campaign ?? path.basename(ctx.manager.campaign.dir),
      campaignName: ctx.manager.campaign.config.name,
      campaigns: await listCampaigns(),
      activeNarrator: !config.llm.apiKey || config.llm.provider === "mock" ? "mock" : "llm",
      // Bootstrap values that stay in the environment (shown read-only).
      env: {
        piperConfigured: config.piperUrl != null,
        basicAuth: config.basicAuth != null,
      },
    };
  }

  app.get("/api/settings", async () => settingsView());

  app.put<{ Body: Settings }>("/api/settings", async (req, reply) => {
    const patch = (req.body ?? {}) as Settings;
    // Whitelist the editable fields — never let arbitrary keys through.
    const clean: Settings = {};
    if (patch.llm) {
      clean.llm = {};
      if (patch.llm.apiKey !== undefined) clean.llm.apiKey = patch.llm.apiKey;
      if (patch.llm.baseUrl !== undefined) clean.llm.baseUrl = patch.llm.baseUrl;
      if (patch.llm.model !== undefined) clean.llm.model = patch.llm.model;
      if (patch.llm.provider === "auto" || patch.llm.provider === "mock")
        clean.llm.provider = patch.llm.provider;
    }
    if (patch.image) {
      clean.image = {};
      if (patch.image.enabled !== undefined) clean.image.enabled = Boolean(patch.image.enabled);
      if (patch.image.apiKey !== undefined) clean.image.apiKey = patch.image.apiKey;
      if (patch.image.baseUrl !== undefined) clean.image.baseUrl = patch.image.baseUrl;
      if (patch.image.model !== undefined) clean.image.model = patch.image.model;
    }
    if (patch.srdPath !== undefined) clean.srdPath = patch.srdPath;
    if (patch.campaign !== undefined) clean.campaign = patch.campaign;

    try {
      const merged = await saveSettings(config.vaultPath, clean);
      // Rebuild the effective config + narrator from env + the new settings.
      config = applySettings(loadConfig(), merged);
      llm = makeLlm();
      app.log.info(`Settings updated; narrator=${!config.llm.apiKey || config.llm.provider === "mock" ? "mock" : "llm"}`);
      return settingsView();
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Full scene + state snapshot for initial client hydration. */
  app.get("/api/state", async () => ({
    campaign: ctx.manager.campaign.config,
    session: ctx.manager.session,
    actors: ctx.manager.campaign.actors,
    locations: ctx.manager.campaign.locations,
    encounters: ctx.manager.campaign.encounters,
    items: ctx.manager.campaign.items,
    lore: ctx.manager.campaign.lore,
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

  /** On-demand image generation (portrait / location / scene atmosphere). */
  app.post<{ Body: { subject: ImageSubject; id?: string } }>(
    "/api/image",
    async (req, reply) => {
      if (!config.image)
        return reply.code(503).send({ error: "Generování obrázků není nakonfigurováno (chybí adresa poskytovatele)" });
      const { subject, id } = req.body ?? {};
      if (!subject) return reply.code(400).send({ error: "Chybí subject" });
      try {
        const prompt = buildPrompt(
          subject,
          ctx.manager.campaign.actors,
          ctx.manager.campaign.locations,
          ctx.manager.session,
          id,
        );
        const client = new ImageClient(config.image);
        const result = await client.generate(prompt);
        return result;
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  /** TTS proxy to Piper (§11). Returns audio/wav. */
  app.post<{ Body: { text: string } }>("/api/tts", async (req, reply) => {
    if (!config.piperUrl) return reply.code(503).send({ error: "TTS not configured" });
    const text = req.body?.text ?? "";
    const upstream = await fetch(`${config.piperUrl}/tts`, {
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
