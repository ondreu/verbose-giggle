import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { FastifyInstance } from "fastify";
import { LlmClient, type Llm } from "../llm/client.js";
import { MockLlmClient } from "../llm/mock.js";
import { ImageClient, buildMapPrompt, buildPrompt, type ImageSubject } from "../llm/image.js";
import { synthesizeAzure } from "../tts/azure.js";
import { resolveAiTurns, runArrival, runIntro, runRecap, runTurn } from "../session/loop.js";
import { startEncounter } from "../session/encounter.js";
import type { EventBus } from "../session/events.js";
import { SessionManager } from "../session/manager.js";
import { createCampaign } from "../vault/scaffold.js";
import { instantiateTemplate, listTemplates } from "../vault/templates.js";
import { listFiles, zipDir } from "../vault/zip.js";
import { forgeCampaign, type ForgeInput, type ProgressCallback } from "../vault/forge.js";
import { createCharacter, creationOptions, levelUpOptions, removeFromParty, type CharacterDraft } from "../vault/creation.js";
import {
  checkpointTurn,
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
  undoLastTurn,
} from "../vault/snapshots.js";
import { applySettings, loadConfig, type Config } from "../config.js";
import { loadSettings, saveSettings, type Settings } from "../settings.js";

export interface GameContext {
  manager: SessionManager;
  bus: EventBus;
  config: Config;
}

/** Image MIME → file extension for stored assets. */
const IMG_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/** Resolve a generated image (data: URL or http(s) URL) to raw bytes + extension. */
async function fetchImageBytes(url: string): Promise<{ buf: Buffer; ext: string }> {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
  if (m) return { buf: Buffer.from(m[2]!, "base64"), ext: IMG_EXT[m[1]!] ?? "png" };
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stažení obrázku selhalo (${res.status})`);
  const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0]!.trim();
  return { buf: Buffer.from(await res.arrayBuffer()), ext: IMG_EXT[mime] ?? "png" };
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
      // TTS: Azure (expressive Czech) is GUI-editable; Piper URL stays env.
      tts: {
        engine: config.azureTts ? "azure" : config.piperUrl ? "piper" : "off",
        azureRegion: config.azureTts?.region ?? "",
        voice: config.azureTts?.voice ?? "cs-CZ-AntoninNeural",
        rate: config.azureTts?.rate ?? "-6%",
        pitch: config.azureTts?.pitch ?? "-2%",
        azureKeySet: Boolean(config.azureTts?.key),
        piperFallback: config.piperUrl != null,
      },
      srdPath: config.srdPath,
      // SRD dataset load summary so the table can confirm it's mounted.
      srd: ctx.manager.srdStats(),
      // The selectable identity is the campaign *folder*, not its display name.
      campaign: stored.campaign ?? path.basename(ctx.manager.campaign.dir),
      campaignName: ctx.manager.campaign.config.name,
      campaigns: await listCampaigns(),
      activeNarrator: !config.llm.apiKey || config.llm.provider === "mock" ? "mock" : "llm",
      // Bootstrap values that stay in the environment (shown read-only).
      env: {
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
    if (patch.tts) {
      clean.tts = {};
      if (patch.tts.azureKey !== undefined) clean.tts.azureKey = patch.tts.azureKey;
      if (patch.tts.azureRegion !== undefined) clean.tts.azureRegion = patch.tts.azureRegion;
      if (patch.tts.voice !== undefined) clean.tts.voice = patch.tts.voice;
      if (patch.tts.rate !== undefined) clean.tts.rate = patch.tts.rate;
      if (patch.tts.pitch !== undefined) clean.tts.pitch = patch.tts.pitch;
      if (patch.tts.style !== undefined) clean.tts.style = patch.tts.style;
    }
    if (patch.srdPath !== undefined) clean.srdPath = patch.srdPath;
    if (patch.campaign !== undefined) clean.campaign = patch.campaign;

    try {
      const prevSrdPath = config.srdPath;
      const merged = await saveSettings(config.vaultPath, clean);
      // Rebuild the effective config + narrator from env + the new settings.
      config = applySettings(loadConfig(), merged);
      llm = makeLlm();
      // If the SRD dataset path changed, re-mount it live so creation/leveling
      // see the new dataset without a restart, and tell clients to re-hydrate.
      if (config.srdPath !== prevSrdPath) {
        await reopenManager();
        const s = ctx.manager.srdStats();
        app.log.info(`SRD remounted from ${config.srdPath}: ${s.total} records (${s.spells} spells, ${s.monsters} monsters)`);
        ctx.bus.emit({ type: "reload", reason: "srd-remounted" });
      }
      app.log.info(`Settings updated; narrator=${!config.llm.apiKey || config.llm.provider === "mock" ? "mock" : "llm"}`);
      return settingsView();
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Campaigns: start-menu management + hot-swap (§2) ---------------------
  /** Re-open the SessionManager in place; handlers read ctx.manager lazily. */
  async function reopenManager(folder?: string): Promise<void> {
    const dir = folder
      ? path.join(config.vaultPath, "campaigns", folder)
      : ctx.manager.campaign.dir;
    ctx.manager = await SessionManager.open(dir, { srdDir: config.srdPath });
  }

  /** List campaigns with display name + party size for the start menu. */
  app.get("/api/campaigns", async () => {
    const folders = await listCampaigns();
    const active = path.basename(ctx.manager.campaign.dir);
    const campaigns = [];
    for (const folder of folders) {
      let name = folder;
      let party = 0;
      try {
        const raw = await fs.readFile(
          path.join(config.vaultPath, "campaigns", folder, "campaign.yaml"),
          "utf8",
        );
        const cfg = YAML.parse(raw) ?? {};
        name = cfg.name ?? folder;
        party = Array.isArray(cfg.party) ? cfg.party.length : 0;
      } catch {
        /* skip unreadable config */
      }
      campaigns.push({ folder, name, party, active: folder === active });
    }
    return { active, campaigns };
  });

  /** List shared worlds available in the vault, for the forge picker (#49). */
  app.get("/api/worlds", async () => {
    const root = path.join(config.vaultPath, "worlds");
    let names: string[] = [];
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      names = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return { worlds: [] };
    }
    const worlds = [];
    for (const id of names) {
      let name = id;
      try {
        const raw = await fs.readFile(path.join(root, id, "WORLD.md"), "utf8");
        const m = raw.match(/^#\s+(.+)$/m);
        if (m) name = m[1]!.replace(/\s*[—-].*$/, "").trim();
      } catch {
        /* no WORLD.md — fall back to folder name */
      }
      worlds.push({ id, name });
    }
    return { worlds };
  });

  /** Create a fresh campaign folder (optionally switch to it). */
  app.post<{ Body: { name: string; folder?: string; startingLocationName?: string; select?: boolean } }>(
    "/api/campaigns",
    async (req, reply) => {
      try {
        const folder = await createCampaign(config.vaultPath, {
          name: req.body?.name ?? "",
          folder: req.body?.folder,
          startingLocationName: req.body?.startingLocationName,
        });
        if (req.body?.select) {
          await saveSettings(config.vaultPath, { campaign: folder });
          config = applySettings(loadConfig(), await loadSettings(config.vaultPath));
          await reopenManager(folder);
          llm = makeLlm();
          ctx.bus.emit({ type: "reload", reason: "campaign-created" });
        }
        return { ok: true, folder };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  /** List the built-in template campaigns for the start menu (#3). */
  app.get("/api/templates", async () => ({ templates: await listTemplates() }));

  /** Instantiate a built-in template into a fresh, persistent campaign (#3). */
  app.post<{ Body: { template: string; name?: string; select?: boolean } }>(
    "/api/campaigns/from-template",
    async (req, reply) => {
      const template = (req.body?.template ?? "").trim();
      if (!template) return reply.code(400).send({ error: "missing template" });
      try {
        const folder = await instantiateTemplate(config.vaultPath, template, req.body?.name);
        if (req.body?.select !== false) {
          await saveSettings(config.vaultPath, { campaign: folder });
          config = applySettings(loadConfig(), await loadSettings(config.vaultPath));
          await reopenManager(folder);
          llm = makeLlm();
          ctx.bus.emit({ type: "reload", reason: "campaign-from-template" });
        }
        return { ok: true, folder };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  /** Build a campaign with the AI from a player brief, then switch to it. */
  app.post<{ Body: ForgeInput & { select?: boolean } }>("/api/campaigns/forge", async (req, reply) => {
    try {
      const { folder, usedLlm } = await forgeCampaign(config.vaultPath, llm, req.body as ForgeInput);
      if (req.body?.select !== false) {
        await saveSettings(config.vaultPath, { campaign: folder });
        config = applySettings(loadConfig(), await loadSettings(config.vaultPath));
        await reopenManager(folder);
        llm = makeLlm();
        ctx.bus.emit({ type: "reload", reason: "campaign-forged" });
      }
      return { ok: true, folder, usedLlm };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Streaming SSE variant — emits progress events for each generation phase (#46b). */
  app.post<{ Body: ForgeInput & { select?: boolean } }>("/api/campaigns/forge/stream", async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (event: string, data: unknown) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    req.raw.on("close", () => { /* client disconnected — writes will be no-ops via writableEnded */ });

    try {
      const onProgress: ProgressCallback = (phase, msg) => send("progress", { phase, msg });
      const { folder, usedLlm } = await forgeCampaign(
        config.vaultPath,
        llm,
        req.body as ForgeInput,
        onProgress,
      );

      if (req.body?.select !== false) {
        send("progress", { phase: "Aktivace", msg: "Přepínám aktivní kampaň…" });
        await saveSettings(config.vaultPath, { campaign: folder });
        config = applySettings(loadConfig(), await loadSettings(config.vaultPath));
        await reopenManager(folder);
        llm = makeLlm();
        ctx.bus.emit({ type: "reload", reason: "campaign-forged" });
      }

      send("done", { ok: true, folder, usedLlm });
    } catch (err) {
      send("error", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      reply.raw.end();
    }

    return reply;
  });

  /** Switch the active campaign — persists the choice and hot-swaps in place. */
  app.post<{ Body: { folder: string } }>("/api/campaigns/select", async (req, reply) => {
    const folder = (req.body?.folder ?? "").trim();
    if (!folder) return reply.code(400).send({ error: "missing folder" });
    const dir = path.join(config.vaultPath, "campaigns", folder);
    try {
      await fs.access(path.join(dir, "campaign.yaml"));
    } catch {
      return reply.code(404).send({ error: "unknown campaign" });
    }
    await saveSettings(config.vaultPath, { campaign: folder });
    config = applySettings(loadConfig(), await loadSettings(config.vaultPath));
    await reopenManager(folder);
    llm = makeLlm();
    ctx.bus.emit({ type: "reload", reason: "campaign-changed" });
    return { ok: true, campaign: ctx.manager.campaign.config.name };
  });

  // --- Campaign management: browse / export / delete (#35) -----------------
  /** Resolve a campaign folder param to its dir, confined to the vault. */
  function campaignDir(folder: string): string | null {
    const safe = path.basename((folder ?? "").trim());
    if (!safe || safe !== folder.trim()) return null;
    return path.join(config.vaultPath, "campaigns", safe);
  }

  /** Read-only file tree of a campaign's vault (relative POSIX paths). */
  app.get<{ Params: { folder: string } }>("/api/campaigns/:folder/files", async (req, reply) => {
    const dir = campaignDir(req.params.folder);
    if (!dir) return reply.code(400).send({ error: "invalid folder" });
    try {
      await fs.access(path.join(dir, "campaign.yaml"));
      return { files: await listFiles(dir) };
    } catch {
      return reply.code(404).send({ error: "unknown campaign" });
    }
  });

  /** Export the campaign folder as a .zip download. */
  app.get<{ Params: { folder: string } }>("/api/campaigns/:folder/export", async (req, reply) => {
    const dir = campaignDir(req.params.folder);
    if (!dir) return reply.code(400).send({ error: "invalid folder" });
    try {
      await fs.access(path.join(dir, "campaign.yaml"));
    } catch {
      return reply.code(404).send({ error: "unknown campaign" });
    }
    const zip = await zipDir(dir);
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="${path.basename(dir)}.zip"`);
    return reply.send(zip);
  });

  /** Delete a campaign folder. Refuses the currently active campaign. */
  app.delete<{ Params: { folder: string } }>("/api/campaigns/:folder", async (req, reply) => {
    const dir = campaignDir(req.params.folder);
    if (!dir) return reply.code(400).send({ error: "invalid folder" });
    if (path.basename(dir) === path.basename(ctx.manager.campaign.dir)) {
      return reply.code(409).send({ error: "Nelze smazat aktivní kampaň — nejdřív přepni na jinou." });
    }
    try {
      await fs.access(path.join(dir, "campaign.yaml"));
    } catch {
      return reply.code(404).send({ error: "unknown campaign" });
    }
    await fs.rm(dir, { recursive: true, force: true });
    return { ok: true };
  });

  /**
   * Generate an AI overworld map for the active campaign and store it as the
   * base map (#37). Stretch/optional: a failure (no image config, upstream
   * error) leaves the campaign untouched — it plays fine without the image.
   */
  app.post("/api/campaigns/map", async (_req, reply) => {
    if (!config.image)
      return reply.code(503).send({ error: "Generování obrázků není nakonfigurováno" });
    try {
      const prompt = buildMapPrompt(ctx.manager.campaign.config.name, ctx.manager.campaign.locations);
      const { url } = await new ImageClient(config.image).generate(prompt);
      const { buf, ext } = await fetchImageBytes(url);
      const rel = `maps/overworld-ai.${ext}`;
      const abs = path.join(ctx.manager.campaign.dir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, buf);
      // Point the campaign at the new base map.
      const cfgPath = path.join(ctx.manager.campaign.dir, "campaign.yaml");
      const cfg = YAML.parse(await fs.readFile(cfgPath, "utf8")) ?? {};
      cfg.world_map = rel;
      await fs.writeFile(cfgPath, YAML.stringify(cfg), "utf8");
      await reopenManager();
      ctx.bus.emit({ type: "reload", reason: "map-generated" });
      return { ok: true, world_map: rel };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Snapshots: campaign rollback (§7) -----------------------------------
  app.get("/api/snapshots", async () => ({
    snapshots: await listSnapshots(ctx.manager.campaign.dir),
  }));

  app.post<{ Body: { label?: string } }>("/api/snapshots", async (req) => ({
    ok: true,
    snapshot: await createSnapshot(ctx.manager.campaign.dir, { label: req.body?.label }),
  }));

  app.post<{ Params: { id: string } }>("/api/snapshots/:id/restore", async (req, reply) => {
    try {
      await restoreSnapshot(ctx.manager.campaign.dir, req.params.id);
      await reopenManager();
      ctx.bus.emit({ type: "reload", reason: "snapshot-restored" });
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/snapshots/:id", async (req, reply) => {
    try {
      await deleteSnapshot(ctx.manager.campaign.dir, req.params.id);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Undo the last player turn (in-chat quick rollback). */
  app.post("/api/undo", async (_req, reply) => {
    try {
      const undone = await undoLastTurn(ctx.manager.campaign.dir);
      if (!undone) return reply.code(400).send({ error: "Není co vrátit — žádný předchozí tah." });
      await reopenManager();
      ctx.bus.emit({ type: "reload", reason: "undo" });
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- SRD item resolution (#20): equipment + magic items, for inventory/loot.
  app.get<{ Querystring: { ids?: string } }>("/api/srd/items", async (req) => {
    const srd = ctx.manager.srd();
    const ids = (req.query?.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const out: Record<string, { name: string; category?: string; rarity?: string; magic: boolean; description?: string; properties?: string[] }> = {};
    for (const id of ids) {
      const eq = srd.equipment(id);
      if (eq) {
        out[id] = { name: eq.name, category: eq.category, magic: false, properties: eq.properties };
        continue;
      }
      const mi = srd.magicItem(id);
      if (mi) out[id] = { name: mi.name, category: mi.category, rarity: mi.rarity, magic: true, description: mi.description };
    }
    return out;
  });

  // --- SRD lookup endpoints for UI tooltips / hover cards (#42) -----------

  /** Look up one spell by id. Returns 404 when the SRD dataset isn't mounted
   *  or the spell is unknown; the client falls back to showing the raw id. */
  app.get<{ Params: { id: string } }>("/api/srd/spell/:id", (req) => {
    const spell = ctx.manager.srd().spell(req.params.id);
    return spell ?? {};
  });

  /** Batch spell lookup by comma-separated ids (for sheet/picker tooltips). */
  app.get<{ Querystring: { ids?: string } }>("/api/srd/spells", (req) => {
    const ids = (req.query?.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const out: Record<string, unknown> = {};
    const srd = ctx.manager.srd();
    for (const id of ids) {
      const s = srd.spell(id);
      if (s) out[id] = s;
    }
    return out;
  });

  /** Look up a feat by id for hover cards (#42c). */
  app.get<{ Params: { id: string } }>("/api/srd/feat/:id", (req) => {
    return ctx.manager.srd().feat(req.params.id) ?? {};
  });

  /** Look up a class/racial feature by id for hover cards (#42c). Falls back to
   *  the racial trait table when the id isn't a class feature, so a single
   *  endpoint serves the sheet's "Schopnosti" row (features + traits mixed). */
  app.get<{ Params: { id: string } }>("/api/srd/feature/:id", (req) => {
    const srd = ctx.manager.srd();
    return srd.feature(req.params.id) ?? srd.trait(req.params.id) ?? {};
  });

  // --- Character creation (#14) --------------------------------------------
  app.get("/api/creation/options", async () => creationOptions(ctx.manager.srd()));

  app.post<{ Body: CharacterDraft }>("/api/characters", async (req, reply) => {
    try {
      // If the campaign is over (a fallen solo hero, #23), this creation is a
      // replacement: remember the ending so we can retire the dead PC and
      // resume play with the newcomer.
      const ending = ctx.manager.session.ending;
      const { id } = await createCharacter(ctx.manager.campaign, req.body as CharacterDraft, ctx.manager.srd());
      if (ending?.actor) await removeFromParty(ctx.manager.campaign.dir, ending.actor);
      // Reload so the new actor + party membership are live.
      await reopenManager();
      if (ending) {
        // Lift the game-over state and hand control to the new character.
        ctx.manager.session.ending = null;
        ctx.manager.session.active_player = id;
        await ctx.manager.persist();
      } else if (!ctx.manager.session.active_player) {
        // First character of a fresh campaign: point the hotseat at them.
        ctx.manager.session.active_player = id;
        await ctx.manager.persist();
      }
      ctx.bus.emit({ type: "reload", reason: "character-created" });
      return { ok: true, id };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Level-up (#13): options the next level grants (SRD-derived) ---------
  app.get<{ Querystring: { actor?: string } }>("/api/level-up/options", async (req, reply) => {
    const id = req.query?.actor;
    const actor = id ? ctx.manager.campaign.actors[id] : undefined;
    if (!actor) return reply.code(400).send({ error: "unknown actor" });
    return levelUpOptions(ctx.manager.srd(), actor);
  });

  // --- Level-up (#13): wire the GUI choices through the engine --------------
  app.post<{
    Body: { actor: string; asi?: Record<string, number>; spells?: string[]; subclass?: string; feats?: string[] };
  }>(
    "/api/level-up",
    async (req, reply) => {
      const actor = req.body?.actor;
      if (!actor) return reply.code(400).send({ error: "missing actor" });
      const gs = ctx.manager.buildGameState();
      const before = ctx.manager.session.log.length;

      const lv = await ctx.manager.applyTool(gs, "level_up", { actor });
      if (!lv.ok) return reply.code(400).send({ error: lv.error });
      // The engine signals a refused level-up (e.g. not enough XP) by returning
      // an `{ error }` result rather than throwing, so `lv.ok` stays true. Surface
      // it as a 400 so the UI shows the reason instead of closing silently (#7).
      const lvErr = (lv.result as { error?: string } | undefined)?.error;
      if (typeof lvErr === "string") return reply.code(400).send({ error: lvErr });
      if (req.body?.subclass) {
        const r = await ctx.manager.applyTool(gs, "choose_subclass", { actor, subclass: req.body.subclass });
        if (!r.ok) return reply.code(400).send({ error: r.error });
      }
      if (req.body?.asi && Object.keys(req.body.asi).length) {
        const r = await ctx.manager.applyTool(gs, "ability_increase", { actor, increments: req.body.asi });
        if (!r.ok) return reply.code(400).send({ error: r.error });
      }
      if (Array.isArray(req.body?.feats) && req.body.feats.length) {
        await ctx.manager.applyTool(gs, "grant_feat", { actor, feats: req.body.feats });
      }
      if (Array.isArray(req.body?.spells) && req.body.spells.length) {
        await ctx.manager.applyTool(gs, "learn_spell", { actor, spells: req.body.spells });
      }

      for (const entry of ctx.manager.session.log.slice(before)) ctx.bus.emit({ type: "log", entry });
      // Level-up is a durable sheet change; persist notes and reload in place.
      await ctx.manager.flushDurable(gs);
      await reopenManager();
      ctx.bus.emit({ type: "reload", reason: "level-up" });
      return { ok: true, result: lv.result };
    },
  );

  /** Full scene + state snapshot for initial client hydration. */
  app.get("/api/state", async () => ({
    campaign: ctx.manager.campaign.config,
    session: ctx.manager.session,
    actors: ctx.manager.campaign.actors,
    locations: ctx.manager.campaign.locations,
    encounters: ctx.manager.campaign.encounters,
    items: ctx.manager.campaign.items,
    lore: ctx.manager.campaign.lore,
    factions: ctx.manager.campaign.factions,
    npcs: ctx.manager.campaign.npcs,
    worldEvents: ctx.manager.campaign.worldEvents,
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

  /** DM opening scene for a fresh campaign (#31). Runs once — a no-op if the
      session already has any chat history, so reloads never re-trigger it. */
  app.post("/api/intro", async (_req, reply) => {
    const hasHistory = ctx.manager.session.chat.some(
      (m) => m.role === "user" || m.role === "assistant",
    );
    if (hasHistory || ctx.manager.session.ending) return { started: false };
    try {
      const { intro } = await runIntro({ manager: ctx.manager, llm, bus: ctx.bus });
      return { started: true, intro };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
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
  app.post<{ Body: { input: string; as?: string } }>("/api/action", async (req, reply) => {
    const input = (req.body?.input ?? "").trim();
    if (!input) return reply.code(400).send({ error: "empty input" });
    // A finished campaign (party wipe, #23) accepts no further actions until
    // the player rolls back to an earlier snapshot.
    if (ctx.manager.session.ending)
      return reply.code(409).send({ error: ctx.manager.session.ending.reason });
    try {
      // Checkpoint the pre-turn state so the player can undo this message.
      await checkpointTurn(ctx.manager.campaign.dir, `Před: „${input.slice(0, 40)}“`);
      const partyVoice = req.body?.as === "party";
      const { narration } = await runTurn({ manager: ctx.manager, llm, bus: ctx.bus, input, partyVoice });
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

    // Inject authored edge duration into travel args so the clock advances
    // even when the client only sends { to } (#41a). Only inject when the
    // client hasn't already supplied a duration.
    let enrichedArgs = args as Record<string, unknown>;
    if (tool === "travel") {
      const dest = (args as { to?: string }).to;
      const here = ctx.manager.campaign.locations[ctx.manager.session.current_location];
      const edge = dest ? (here?.connections ?? []).find((c) => c.to === dest) : undefined;
      const hasDuration = enrichedArgs.days !== undefined || enrichedArgs.hours !== undefined;
      if (edge?.travel?.days && !hasDuration) {
        enrichedArgs = { ...enrichedArgs, days: edge.travel.days };
      }
    }

    const gs = ctx.manager.buildGameState();
    const before = ctx.manager.session.log.length;
    const result = await ctx.manager.applyTool(gs, tool, enrichedArgs);
    for (const entry of ctx.manager.session.log.slice(before)) {
      ctx.bus.emit({ type: "log", entry });
    }
    await ctx.manager.checkpoint(gs);
    ctx.bus.emit({ type: "state", state: ctx.manager.session });

    // After successful travel, have the DM narrate the arrival scene (#41b).
    if (tool === "travel" && result.ok) {
      await runArrival({ manager: ctx.manager, llm, bus: ctx.bus });
    } else {
      // For non-travel commands, auto-resolve AI turns as before (§8.3).
      await resolveAiTurns({ manager: ctx.manager, llm, bus: ctx.bus, gs });
    }

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

  /**
   * Synthesize speech to WAV bytes. Primary engine is the given Azure config
   * (expressive Czech); Piper is the fallback when Azure is absent or errors.
   * Returns null only when no engine is configured at all.
   */
  async function synthesizeTts(
    text: string,
    azure: Config["azureTts"],
    provider: "auto" | "azure" | "piper" = "auto",
  ): Promise<Buffer | null> {
    // The client can force a single engine (#30); "auto" keeps the default
    // Azure-first-with-Piper-fallback behaviour.
    const tryAzure = provider !== "piper" && azure;
    const tryPiper = provider !== "azure" && config.piperUrl;
    if (tryAzure) {
      try {
        return await synthesizeAzure(azure!, text);
      } catch (err) {
        app.log.warn(
          `Azure TTS failed${tryPiper ? ", falling back to Piper" : ""}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (tryPiper) {
      const upstream = await fetch(`${config.piperUrl}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (upstream.ok && upstream.body) return Buffer.from(await upstream.arrayBuffer());
    }
    return null;
  }

  /**
   * TTS (§11). Returns audio/wav. Azure (expressive) first, Piper fallback.
   */
  app.post<{ Body: { text: string; provider?: "auto" | "azure" | "piper" } }>("/api/tts", async (req, reply) => {
    const text = req.body?.text ?? "";
    const provider = req.body?.provider === "azure" || req.body?.provider === "piper" ? req.body.provider : "auto";
    if (!config.azureTts && !config.piperUrl)
      return reply.code(503).send({ error: "TTS not configured" });
    const wav = await synthesizeTts(text, config.azureTts, provider);
    if (!wav) return reply.code(502).send({ error: "TTS upstream error" });
    reply.header("Content-Type", "audio/wav");
    return reply.send(wav);
  });

  /**
   * Voice preview for the settings UI. Synthesizes a sample line using the
   * (possibly unsaved) form values layered over the saved config, so the table
   * can audition a voice/key/rate/pitch before committing. The key, if given,
   * is used only for this request and never persisted here.
   */
  app.post<{
    Body: { text?: string; voice?: string; rate?: string; pitch?: string; region?: string; azureKey?: string };
  }>("/api/tts/preview", async (req, reply) => {
    const b = req.body ?? {};
    const text = (b.text?.trim() ||
      "Měl bys být nadšený, ale pohled na zemi, kterou opouštíš, tvůj smutek nijak nezmírňuje.\n\nJak symbol září, proudí tebou síla. Autorita.").slice(0, 500);

    const base = config.azureTts;
    const key = b.azureKey || base?.key || "";
    const region = (b.region?.trim() || base?.region || "").trim();
    const azure =
      key && region
        ? {
            key,
            region,
            voice: b.voice?.trim() || base?.voice || "cs-CZ-AntoninNeural",
            rate: b.rate?.trim() || base?.rate || "-6%",
            pitch: b.pitch?.trim() || base?.pitch || "-2%",
            style: base?.style ?? null,
            format: base?.format ?? "riff-24khz-16bit-mono-pcm",
          }
        : null;

    if (!azure && !config.piperUrl)
      return reply.code(503).send({ error: "Hlas není nakonfigurován" });
    const wav = await synthesizeTts(text, azure);
    if (!wav) return reply.code(502).send({ error: "Syntéza hlasu selhala" });
    reply.header("Content-Type", "audio/wav");
    return reply.send(wav);
  });
}
