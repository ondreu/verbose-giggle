import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { LlmClient, type Llm } from "../llm/client.js";
import { MeteredLlm, creditsPerMessage } from "../credits/metering.js";
import type { CreditStore } from "../credits/ledger.js";
import { MockLlmClient } from "../llm/mock.js";
import { ImageClient, buildMapPrompt, buildPrompt, type ImageSubject } from "../llm/image.js";
import { synthesizeAzure } from "../tts/azure.js";
import { resolveAiTurns, runArrival, runIntro, runRecap, runTurn } from "../session/loop.js";
import { startEncounter } from "../session/encounter.js";
import type { SessionManager } from "../session/manager.js";
import { SessionRegistry, type UserSession } from "../session/registry.js";
import { deleteUserVault } from "../admin/ops.js";
import { createCampaign } from "../vault/scaffold.js";
import { instantiateTemplate, listTemplates } from "../vault/templates.js";
import { listFiles, unzipInto, zipDir } from "../vault/zip.js";
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
import { csSpellName, csItemName } from "@adm/schemas";

export interface GameContext {
  config: Config;
  /** Credit ledger for metering LLM usage (#56b); null disables metering. */
  credits: CreditStore | null;
  /**
   * Hook to share the live, mutable config with the rest of the app (#57b).
   * Game routes own the canonical `config` (handlers read it at call time so a
   * reassignment is seen everywhere); this hands `index.ts` a getter + a reload
   * so the admin panel can change operational settings and the auth guard /
   * flags see them without a restart. All changes persist in the vault.
   */
  exposeConfig?: (access: { get: () => Config; reload: () => Promise<Config> }) => void;
  /**
   * Hand `index.ts` a function that purges a user's isolated game data (#59e):
   * deletes their `<vault>/users/<id>` subtree and evicts the cached scope so a
   * stale manager isn't reused. Late-bound here (the registry lives in this
   * module) and invoked by the account-deletion route.
   */
  exposePurgeUserScope?: (purge: (userId: string) => Promise<void>) => void;
  /**
   * Hand `index.ts` a function that invalidates one scope after its data changed
   * on disk (#59d, e.g. the admin panel deleted a campaign in it), so the cached
   * `SessionManager` for that scope is dropped and clients re-hydrate.
   */
  exposeInvalidateScope?: (invalidate: (scopeKey: string, reason: string) => Promise<void>) => void;
}

/** Thrown by the metering helper when a user has no credits left (#56c). */
class InsufficientCreditsError extends Error {
  constructor() {
    super("Nedostatek kreditů.");
    this.name = "InsufficientCreditsError";
  }
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

  // Per-scope game state (#55f): a shared vault when anonymous, a
  // <vault>/users/<id> subtree per user when accounts are on. Every handler
  // resolves its scope from the request and reads `sess.manager`/`sess.bus`.
  const registry = new SessionRegistry({ getConfig: () => config });
  // Self-hosted: open + validate the boot campaign now, so a vault with no
  // campaigns fails fast at startup exactly as it did before.
  if (config.auth.allowAnonymous) {
    const shared = await registry.openShared();
    app.log.info(`Loaded campaign from ${shared.manager.campaign.dir}`);
  }

  /**
   * Rebuild the effective config from env + the persisted vault settings.json
   * and (if the SRD path changed) re-mount the dataset for every live scope.
   * Shared by the GUI settings route and the admin server-settings route so a
   * change made in either place is seen by all handlers and the auth layer.
   */
  async function reloadConfig(): Promise<Config> {
    const prevSrdPath = config.srdPath;
    config = applySettings(loadConfig(), await loadSettings(config.vaultPath));
    if (config.srdPath !== prevSrdPath) {
      await registry.invalidateAll("srd-remounted");
      app.log.info(`SRD remounted from ${config.srdPath}`);
    }
    return config;
  }
  // Hand index.ts a window into the live config (auth guard / flags / admin).
  ctx.exposeConfig?.({ get: () => config, reload: reloadConfig });
  // …and a way to purge a deleted user's isolated data + drop its cached scope.
  ctx.exposePurgeUserScope?.(async (userId) => {
    await deleteUserVault(config.vaultPath, userId);
    registry.evict(userId);
  });
  // …and a way for the admin panel to invalidate a scope whose data it changed.
  ctx.exposeInvalidateScope?.((scopeKey, reason) => registry.invalidateScope(scopeKey, reason));

  /**
   * Build the narrator for the current config. Falls back to the offline mock
   * when no API key is configured (or provider is forced to "mock"), so the
   * full loop + UI run without secrets. The mock introspects live state, so it
   * takes the request's resolved manager.
   */
  function makeLlm(manager: SessionManager, modelOverride?: string): Llm {
    const useMock = !config.llm.apiKey || config.llm.provider === "mock";
    if (!useMock) return new LlmClient(config, modelOverride);
    return new MockLlmClient(() => {
      const actors = manager.campaign.actors;
      const alive = (id: string) => (manager.session.actors[id]?.hp?.current ?? 1) > 0;
      const friendly = new Set(["party", "ally"]);
      return {
        activePlayer: manager.session.active_player,
        partyIds: Object.values(actors)
          .filter((a) => friendly.has(a.faction))
          .map((a) => a.id),
        hostileIds: Object.values(actors)
          .filter((a) => a.faction === "hostile" && alive(a.id))
          .map((a) => a.id),
        inCombat: manager.session.combat !== null,
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

  if (!config.llm.apiKey || config.llm.provider === "mock") {
    app.log.warn("No LLM API key configured — using offline mock narrator");
  }

  /**
   * Run an LLM operation with credit metering (#56b/#56c/#56f). When metering is
   * off (self-hosted / BYO-key, no accounts, or anonymous request) it just runs.
   * Otherwise: optionally enforce a positive balance up front (`enforce`), run
   * with a metered narrator, and — for a billable player turn (`bill`) — charge
   * a flat **per-message** price for the model that ran (#56f), *after* success
   * so a thrown turn is never billed. The token usage is logged as a cost basis
   * but no longer drives the charge. Non-billable system beats (intro, recap,
   * arrival, AI turns) run metered for logging but aren't charged per message.
   * Charging is a side effect outside the engine, so determinism (#12) holds.
   */
  async function meteredTurn<T>(
    req: FastifyRequest,
    reason: string,
    baseLlm: Llm,
    run: (llm: Llm) => Promise<T>,
    opts: { enforce?: boolean; bill?: boolean; model?: string } = {},
  ): Promise<T> {
    const { enforce = true, bill = false, model } = opts;
    const user = meteringUser(req);
    if (!user) return run(baseLlm);
    if (enforce && ctx.credits!.balance(user.id) <= 0) throw new InsufficientCreditsError();
    const metered = new MeteredLlm(baseLlm);
    const result = await run(metered);
    const basis = metered.cost(config.credits.pricing);
    if (bill) {
      const price = creditsPerMessage(config.credits.pricing, model);
      if (price > 0) ctx.credits!.charge(user.id, price, reason, model ?? null);
      app.log.info(
        `Charged ${price} cr for ${reason} (model=${model ?? "?"}; token cost-basis=${basis}, ` +
          `${metered.usage.promptTokens}+${metered.usage.completionTokens} tok)`,
      );
    } else if (basis > 0) {
      app.log.info(`${reason}: token cost-basis=${basis} (not charged per #56f)`);
    }
    return result;
  }

  /** The user to meter for this request, or null when metering is inactive. */
  function meteringUser(req: FastifyRequest) {
    return config.credits.enabled && ctx.credits && req.user ? req.user : null;
  }

  /** Throw a 402-able error if the request's user has no credits (#56c). */
  function enforceCredits(req: FastifyRequest): void {
    const user = meteringUser(req);
    if (user && ctx.credits!.balance(user.id) <= 0) throw new InsufficientCreditsError();
  }

  /** Charge a flat (non-token) cost for a completed operation (image/TTS). */
  function chargeCredits(req: FastifyRequest, reason: string, amount: number): void {
    const user = meteringUser(req);
    if (user && amount > 0) ctx.credits!.charge(user.id, Math.ceil(amount), reason);
  }

  // --- Settings (GUI-editable runtime config; §9.1) ------------------------
  /** Campaign folders available for selection (for the settings dropdown). */
  async function listCampaigns(sess: UserSession): Promise<string[]> {
    try {
      const entries = await fs.readdir(sess.scopedPath("campaigns"), { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch {
      return [];
    }
  }

  /**
   * The OpenRouter slug this scope's user picked from the operator pool (#56g),
   * or undefined to use the global default. Confined to current pool members so
   * a stale saved slug (model removed from the pool) safely falls back.
   */
  async function resolveSelectedModel(sess: UserSession): Promise<string | undefined> {
    const scoped = await loadSettings(sess.root);
    const wanted = scoped.selectedModel?.trim();
    if (!wanted) return undefined;
    return config.modelPool.some((m) => m.model === wanted) ? wanted : undefined;
  }

  /** Masked view of the effective settings — never leaks secret values. */
  async function settingsView(sess: UserSession): Promise<unknown> {
    // Provider/SRD credentials are global (op-only); the campaign selection is
    // per-scope (#55f). In shared mode `sess.root` IS the vault, so this is
    // identical to reading the single settings file.
    const stored = await loadSettings(config.vaultPath);
    const scoped = sess.isShared ? stored : await loadSettings(sess.root);
    return {
      llm: {
        baseUrl: config.llm.baseUrl,
        model: config.llm.model,
        provider: config.llm.provider,
        apiKeySet: Boolean(config.llm.apiKey),
        // Alternate models the player can re-roll a turn with (#54).
        altModels: stored.llm?.altModels ?? [],
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
      srd: sess.manager.srdStats(),
      // The selectable identity is the campaign *folder*, not its display name.
      campaign: scoped.campaign ?? path.basename(sess.manager.campaign.dir),
      campaignName: sess.manager.campaign.config.name,
      campaigns: await listCampaigns(sess),
      // Operator model pool (#56g) the player picks their own model from. Only
      // player-facing fields — the slug stays internal; the UI shows name +
      // credits + ★ ratings. `selectedModel` is this user's saved choice.
      modelPool: config.modelPool.map((m) => ({
        model: m.model,
        name: m.name,
        perMessage: m.perMessage,
        intelligence: m.intelligence,
        price: m.price,
        tooltip: m.tooltip ?? "",
      })),
      selectedModel: scoped.selectedModel ?? "",
      activeNarrator: !config.llm.apiKey || config.llm.provider === "mock" ? "mock" : "llm",
      // Bootstrap values that stay in the environment (shown read-only).
      env: {
        basicAuth: config.basicAuth != null,
      },
    };
  }

  /**
   * Who may change the GLOBAL provider/SRD credentials (LLM/image/TTS/srdPath).
   * Self-hosted (anonymous access on) keeps the open behaviour — anyone with
   * access to the box can configure it. Hosted (anonymous off) locks it to the
   * admin role, so a regular tenant can't read/rewrite the shared keys; they
   * manage providers from the /admin panel. The per-user campaign selection is
   * never gated by this.
   */
  function canEditProviders(req: FastifyRequest): boolean {
    return config.auth.allowAnonymous || req.user?.role === "admin";
  }

  app.get("/api/settings", async (req) => {
    const view = (await settingsView(await registry.resolve(req))) as Record<string, unknown>;
    return { ...view, canEditProviders: canEditProviders(req) };
  });

  app.put<{ Body: Settings }>("/api/settings", async (req, reply) => {
    const sess = await registry.resolve(req);
    const patch = (req.body ?? {}) as Settings;
    // Global provider/SRD writes are admin-only in hosted mode (see above).
    const touchesGlobal =
      patch.llm !== undefined ||
      patch.image !== undefined ||
      patch.tts !== undefined ||
      patch.srdPath !== undefined;
    if (touchesGlobal && !canEditProviders(req)) {
      return reply
        .code(403)
        .send({ error: "Nastavení poskytovatelů může měnit jen administrátor." });
    }
    // Whitelist the editable fields — never let arbitrary keys through.
    const clean: Settings = {};
    if (patch.llm) {
      clean.llm = {};
      if (patch.llm.apiKey !== undefined) clean.llm.apiKey = patch.llm.apiKey;
      if (patch.llm.baseUrl !== undefined) clean.llm.baseUrl = patch.llm.baseUrl;
      if (patch.llm.model !== undefined) clean.llm.model = patch.llm.model;
      if (patch.llm.provider === "auto" || patch.llm.provider === "mock")
        clean.llm.provider = patch.llm.provider;
      if (Array.isArray(patch.llm.altModels))
        clean.llm.altModels = patch.llm.altModels
          .map((m) => String(m).trim())
          .filter(Boolean);
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
    // The campaign selection and the per-user model choice are per-scope (#55f):
    // route them to the user's own settings, never the global file. Provider/SRD
    // creds stay global. An empty/unknown model clears the choice (global default).
    const campaign = patch.campaign;
    let selectedModel: string | undefined;
    if (patch.selectedModel !== undefined) {
      const wanted = String(patch.selectedModel).trim();
      // Only accept a slug that's actually in the operator pool; otherwise clear.
      selectedModel = config.modelPool.some((m) => m.model === wanted) ? wanted : "";
    }

    try {
      if (Object.keys(clean).length > 0) await saveSettings(config.vaultPath, clean);
      if (campaign !== undefined) await saveSettings(sess.root, { campaign });
      if (selectedModel !== undefined) await saveSettings(sess.root, { selectedModel });
      // Rebuild the effective config from env + the new global settings, and
      // re-mount the SRD dataset live for every scope if its path changed.
      await reloadConfig();
      app.log.info(`Settings updated; narrator=${!config.llm.apiKey || config.llm.provider === "mock" ? "mock" : "llm"}`);
      const view = (await settingsView(sess)) as Record<string, unknown>;
      return { ...view, canEditProviders: canEditProviders(req) };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Campaigns: start-menu management + hot-swap (§2) ---------------------
  /** List campaigns with display name + party size for the start menu. */
  app.get("/api/campaigns", async (req) => {
    const sess = await registry.resolve(req);
    const folders = await listCampaigns(sess);
    const active = path.basename(sess.manager.campaign.dir);
    const campaigns = [];
    for (const folder of folders) {
      let name = folder;
      let party = 0;
      try {
        const raw = await fs.readFile(
          sess.scopedPath("campaigns", folder, "campaign.yaml"),
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
  app.get("/api/worlds", async (req) => {
    const sess = await registry.resolve(req);
    const root = sess.scopedPath("worlds");
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

  // --- World management: browse / edit / download / upload (#worlds) --------
  /** Resolve a world id to its dir, confined to the scope's worlds folder. */
  function worldDir(sess: UserSession, id: string): string | null {
    const safe = path.basename((id ?? "").trim());
    if (!safe || safe !== (id ?? "").trim()) return null;
    return sess.scopedPath("worlds", safe);
  }

  /** Resolve a relative path inside a world, refusing escapes (zip-slip/..). */
  function worldFilePath(sess: UserSession, id: string, rel: string): string | null {
    const dir = worldDir(sess, id);
    if (!dir) return null;
    const base = path.resolve(dir);
    const target = path.resolve(base, rel ?? "");
    if (target !== base && !target.startsWith(base + path.sep)) return null;
    return target;
  }

  // Files we treat as editable text in the world editor; everything else is
  // browse/download only (e.g. map images).
  const TEXT_EXT = new Set([".md", ".markdown", ".yaml", ".yml", ".json", ".txt", ".svg", ".csv"]);

  /** Read-only file tree of a world's vault folder. */
  app.get<{ Params: { id: string } }>("/api/worlds/:id/files", async (req, reply) => {
    const sess = await registry.resolve(req);
    const dir = worldDir(sess, req.params.id);
    if (!dir) return reply.code(400).send({ error: "invalid world" });
    try {
      await fs.access(dir);
      return { files: await listFiles(dir) };
    } catch {
      return reply.code(404).send({ error: "unknown world" });
    }
  });

  /** Read a single text file from a world (for the editor). */
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/worlds/:id/file",
    async (req, reply) => {
      const sess = await registry.resolve(req);
      const rel = (req.query?.path ?? "").trim();
      if (!rel) return reply.code(400).send({ error: "missing path" });
      const target = worldFilePath(sess, req.params.id, rel);
      if (!target) return reply.code(400).send({ error: "invalid path" });
      const editable = TEXT_EXT.has(path.extname(rel).toLowerCase());
      if (!editable) return reply.code(415).send({ error: "Soubor není textový — jen ke stažení." });
      try {
        const content = await fs.readFile(target, "utf8");
        return { path: rel, content };
      } catch {
        return reply.code(404).send({ error: "unknown file" });
      }
    },
  );

  /** Write (create/modify) a single text file in a world. */
  app.put<{ Params: { id: string }; Body: { path?: string; content?: string } }>(
    "/api/worlds/:id/file",
    async (req, reply) => {
      const sess = await registry.resolve(req);
      const dir = worldDir(sess, req.params.id);
      if (!dir) return reply.code(400).send({ error: "invalid world" });
      try {
        await fs.access(dir);
      } catch {
        return reply.code(404).send({ error: "unknown world" });
      }
      const rel = (req.body?.path ?? "").trim();
      const target = worldFilePath(sess, req.params.id, rel);
      if (!rel || !target) return reply.code(400).send({ error: "invalid path" });
      if (!TEXT_EXT.has(path.extname(rel).toLowerCase())) {
        return reply.code(415).send({ error: "Lze upravovat jen textové soubory." });
      }
      if (typeof req.body?.content !== "string") return reply.code(400).send({ error: "missing content" });
      try {
        await fs.mkdir(path.dirname(target), { recursive: true });
        const tmp = `${target}.tmp`;
        await fs.writeFile(tmp, req.body.content, "utf8");
        await fs.rename(tmp, target);
        return { ok: true };
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  /** Export a world folder as a .zip download. */
  app.get<{ Params: { id: string } }>("/api/worlds/:id/export", async (req, reply) => {
    const sess = await registry.resolve(req);
    const dir = worldDir(sess, req.params.id);
    if (!dir) return reply.code(400).send({ error: "invalid world" });
    try {
      await fs.access(dir);
    } catch {
      return reply.code(404).send({ error: "unknown world" });
    }
    const zip = await zipDir(dir);
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="${path.basename(dir)}.zip"`);
    return reply.send(zip);
  });

  /**
   * Import a .zip into a world, merging/overwriting its files (#worlds upload).
   * The body is the base64 of the archive; a missing world id is created. Larger
   * bodyLimit so map images and full-world archives fit.
   */
  app.post<{ Params: { id: string }; Body: { zipBase64?: string } }>(
    "/api/worlds/:id/import",
    { bodyLimit: 96 * 1024 * 1024 },
    async (req, reply) => {
      const sess = await registry.resolve(req);
      const dir = worldDir(sess, req.params.id);
      if (!dir) return reply.code(400).send({ error: "invalid world" });
      const b64 = req.body?.zipBase64;
      if (typeof b64 !== "string" || !b64) return reply.code(400).send({ error: "missing zip" });
      let buf: Buffer;
      try {
        buf = Buffer.from(b64, "base64");
      } catch {
        return reply.code(400).send({ error: "invalid base64" });
      }
      try {
        await fs.mkdir(dir, { recursive: true });
        const written = await unzipInto(dir, buf);
        // If the running campaign uses this world, reload so edits take effect.
        if (sess.manager.campaign.config.world === path.basename(dir)) {
          await sess.reopen();
          sess.bus.emit({ type: "reload", reason: "world-imported" });
        }
        return { ok: true, written };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  /** Create a fresh campaign folder (optionally switch to it). */
  app.post<{ Body: { name: string; folder?: string; startingLocationName?: string; select?: boolean } }>(
    "/api/campaigns",
    async (req, reply) => {
      const sess = await registry.resolve(req);
      try {
        const folder = await createCampaign(sess.root, {
          name: req.body?.name ?? "",
          folder: req.body?.folder,
          startingLocationName: req.body?.startingLocationName,
        });
        if (req.body?.select) {
          await saveSettings(sess.root, { campaign: folder });
          await sess.reopen(folder);
          sess.bus.emit({ type: "reload", reason: "campaign-created" });
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
      const sess = await registry.resolve(req);
      const template = (req.body?.template ?? "").trim();
      if (!template) return reply.code(400).send({ error: "missing template" });
      try {
        const folder = await instantiateTemplate(sess.root, template, req.body?.name);
        if (req.body?.select !== false) {
          await saveSettings(sess.root, { campaign: folder });
          await sess.reopen(folder);
          sess.bus.emit({ type: "reload", reason: "campaign-from-template" });
        }
        return { ok: true, folder };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  /** Build a campaign with the AI from a player brief, then switch to it. */
  app.post<{ Body: ForgeInput & { select?: boolean } }>("/api/campaigns/forge", async (req, reply) => {
    const sess = await registry.resolve(req);
    const llm = makeLlm(sess.manager);
    try {
      enforceCredits(req);
      const { folder, usedLlm } = await forgeCampaign(sess.root, llm, req.body as ForgeInput);
      // Flat per-campaign charge after a successful generation (#56f).
      if (usedLlm) chargeCredits(req, "campaign", config.credits.pricing.perCampaign);
      if (req.body?.select !== false) {
        await saveSettings(sess.root, { campaign: folder });
        await sess.reopen(folder);
        sess.bus.emit({ type: "reload", reason: "campaign-forged" });
      }
      return { ok: true, folder, usedLlm };
    } catch (err) {
      if (err instanceof InsufficientCreditsError) return reply.code(402).send({ error: err.message });
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Streaming SSE variant — emits progress events for each generation phase (#46b). */
  app.post<{ Body: ForgeInput & { select?: boolean } }>("/api/campaigns/forge/stream", async (req, reply) => {
    const sess = await registry.resolve(req);
    const llm = makeLlm(sess.manager);
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
      enforceCredits(req);
      const onProgress: ProgressCallback = (phase, msg) => send("progress", { phase, msg });
      const { folder, usedLlm } = await forgeCampaign(
        sess.root,
        llm,
        req.body as ForgeInput,
        onProgress,
      );
      // Flat per-campaign charge after a successful generation (#56f).
      if (usedLlm) chargeCredits(req, "campaign", config.credits.pricing.perCampaign);

      if (req.body?.select !== false) {
        send("progress", { phase: "Aktivace", msg: "Přepínám aktivní kampaň…" });
        await saveSettings(sess.root, { campaign: folder });
        await sess.reopen(folder);
        sess.bus.emit({ type: "reload", reason: "campaign-forged" });
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
    const sess = await registry.resolve(req);
    const folder = (req.body?.folder ?? "").trim();
    if (!folder) return reply.code(400).send({ error: "missing folder" });
    const dir = sess.scopedPath("campaigns", folder);
    try {
      await fs.access(path.join(dir, "campaign.yaml"));
    } catch {
      return reply.code(404).send({ error: "unknown campaign" });
    }
    await saveSettings(sess.root, { campaign: folder });
    await sess.reopen(folder);
    sess.bus.emit({ type: "reload", reason: "campaign-changed" });
    return { ok: true, campaign: sess.manager.campaign.config.name };
  });

  // --- Campaign management: browse / export / delete (#35) -----------------
  /** Resolve a campaign folder param to its dir, confined to the vault. */
  function campaignDir(sess: UserSession, folder: string): string | null {
    const safe = path.basename((folder ?? "").trim());
    if (!safe || safe !== folder.trim()) return null;
    return sess.scopedPath("campaigns", safe);
  }

  /** Read-only file tree of a campaign's vault (relative POSIX paths). */
  app.get<{ Params: { folder: string } }>("/api/campaigns/:folder/files", async (req, reply) => {
    const sess = await registry.resolve(req);
    const dir = campaignDir(sess, req.params.folder);
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
    const sess = await registry.resolve(req);
    const dir = campaignDir(sess, req.params.folder);
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
    const sess = await registry.resolve(req);
    const dir = campaignDir(sess, req.params.folder);
    if (!dir) return reply.code(400).send({ error: "invalid folder" });
    if (path.basename(dir) === path.basename(sess.manager.campaign.dir)) {
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
  app.post("/api/campaigns/map", async (req, reply) => {
    if (!config.image)
      return reply.code(503).send({ error: "Generování obrázků není nakonfigurováno" });
    const sess = await registry.resolve(req);
    try {
      const prompt = buildMapPrompt(sess.manager.campaign.config.name, sess.manager.campaign.locations);
      const { url } = await new ImageClient(config.image).generate(prompt);
      const { buf, ext } = await fetchImageBytes(url);
      const rel = `maps/overworld-ai.${ext}`;
      const abs = path.join(sess.manager.campaign.dir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, buf);
      // Point the campaign at the new base map.
      const cfgPath = path.join(sess.manager.campaign.dir, "campaign.yaml");
      const cfg = YAML.parse(await fs.readFile(cfgPath, "utf8")) ?? {};
      cfg.world_map = rel;
      await fs.writeFile(cfgPath, YAML.stringify(cfg), "utf8");
      await sess.reopen();
      sess.bus.emit({ type: "reload", reason: "map-generated" });
      return { ok: true, world_map: rel };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Snapshots: campaign rollback (§7) -----------------------------------
  app.get("/api/snapshots", async (req) => {
    const sess = await registry.resolve(req);
    return { snapshots: await listSnapshots(sess.manager.campaign.dir) };
  });

  app.post<{ Body: { label?: string } }>("/api/snapshots", async (req) => {
    const sess = await registry.resolve(req);
    return {
      ok: true,
      snapshot: await createSnapshot(sess.manager.campaign.dir, { label: req.body?.label }),
    };
  });

  app.post<{ Params: { id: string } }>("/api/snapshots/:id/restore", async (req, reply) => {
    const sess = await registry.resolve(req);
    try {
      await restoreSnapshot(sess.manager.campaign.dir, req.params.id);
      await sess.reopen();
      sess.bus.emit({ type: "reload", reason: "snapshot-restored" });
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/snapshots/:id", async (req, reply) => {
    const sess = await registry.resolve(req);
    try {
      await deleteSnapshot(sess.manager.campaign.dir, req.params.id);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Undo the last player turn (in-chat quick rollback). */
  app.post("/api/undo", async (req, reply) => {
    const sess = await registry.resolve(req);
    try {
      const undone = await undoLastTurn(sess.manager.campaign.dir);
      if (!undone) return reply.code(400).send({ error: "Není co vrátit — žádný předchozí tah." });
      await sess.reopen();
      sess.bus.emit({ type: "reload", reason: "undo" });
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- SRD item resolution (#20): equipment + magic items, for inventory/loot.
  app.get<{ Querystring: { ids?: string } }>("/api/srd/items", async (req) => {
    const sess = await registry.resolve(req);
    const srd = sess.manager.srd();
    const ids = (req.query?.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const out: Record<string, { name: string; nameCs: string; category?: string; rarity?: string; magic: boolean; description?: string; properties?: string[] }> = {};
    for (const id of ids) {
      const eq = srd.equipment(id);
      if (eq) {
        // nameCs: Czech where translated, else the SRD's English name (#45b).
        out[id] = { name: eq.name, nameCs: csItemName(id, eq.name), category: eq.category, magic: false, properties: eq.properties };
        continue;
      }
      const mi = srd.magicItem(id);
      if (mi) out[id] = { name: mi.name, nameCs: csItemName(id, mi.name), category: mi.category, rarity: mi.rarity, magic: true, description: mi.description };
    }
    return out;
  });

  // --- SRD lookup endpoints for UI tooltips / hover cards (#42) -----------

  /** Look up one spell by id. Returns 404 when the SRD dataset isn't mounted
   *  or the spell is unknown; the client falls back to showing the raw id. */
  app.get<{ Params: { id: string } }>("/api/srd/spell/:id", async (req) => {
    const sess = await registry.resolve(req);
    const spell = sess.manager.srd().spell(req.params.id);
    // Attach the player-facing Czech name (#45b); ids/name stay English.
    return spell ? { ...spell, nameCs: csSpellName(spell.id, spell.name) } : {};
  });

  /** Batch spell lookup by comma-separated ids (for sheet/picker tooltips). */
  app.get<{ Querystring: { ids?: string } }>("/api/srd/spells", async (req) => {
    const sess = await registry.resolve(req);
    const ids = (req.query?.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const out: Record<string, unknown> = {};
    const srd = sess.manager.srd();
    for (const id of ids) {
      const s = srd.spell(id);
      if (s) out[id] = { ...s, nameCs: csSpellName(s.id, s.name) };
    }
    return out;
  });

  /** Look up a feat by id for hover cards (#42c). */
  app.get<{ Params: { id: string } }>("/api/srd/feat/:id", async (req) => {
    const sess = await registry.resolve(req);
    return sess.manager.srd().feat(req.params.id) ?? {};
  });

  /** Look up a class/racial feature by id for hover cards (#42c). Falls back to
   *  the racial trait table when the id isn't a class feature, so a single
   *  endpoint serves the sheet's "Schopnosti" row (features + traits mixed). */
  app.get<{ Params: { id: string } }>("/api/srd/feature/:id", async (req) => {
    const sess = await registry.resolve(req);
    const srd = sess.manager.srd();
    return srd.feature(req.params.id) ?? srd.trait(req.params.id) ?? {};
  });

  // --- Character creation (#14) --------------------------------------------
  app.get("/api/creation/options", async (req) => {
    const sess = await registry.resolve(req);
    return creationOptions(sess.manager.srd());
  });

  app.post<{ Body: CharacterDraft }>("/api/characters", async (req, reply) => {
    const sess = await registry.resolve(req);
    try {
      // If the campaign is over (a fallen solo hero, #23), this creation is a
      // replacement: remember the ending so we can retire the dead PC and
      // resume play with the newcomer.
      const ending = sess.manager.session.ending;
      const { id } = await createCharacter(sess.manager.campaign, req.body as CharacterDraft, sess.manager.srd());
      if (ending?.actor) await removeFromParty(sess.manager.campaign.dir, ending.actor);
      // Reload so the new actor + party membership are live.
      await sess.reopen();
      if (ending) {
        // Lift the game-over state and hand control to the new character.
        sess.manager.session.ending = null;
        sess.manager.session.active_player = id;
        await sess.manager.persist();
      } else if (!sess.manager.session.active_player) {
        // First character of a fresh campaign: point the hotseat at them.
        sess.manager.session.active_player = id;
        await sess.manager.persist();
      }
      sess.bus.emit({ type: "reload", reason: "character-created" });
      return { ok: true, id };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Level-up (#13): options the next level grants (SRD-derived) ---------
  app.get<{ Querystring: { actor?: string } }>("/api/level-up/options", async (req, reply) => {
    const sess = await registry.resolve(req);
    const id = req.query?.actor;
    const actor = id ? sess.manager.campaign.actors[id] : undefined;
    if (!actor) return reply.code(400).send({ error: "unknown actor" });
    return levelUpOptions(sess.manager.srd(), actor);
  });

  // --- Level-up (#13): wire the GUI choices through the engine --------------
  app.post<{
    Body: { actor: string; asi?: Record<string, number>; spells?: string[]; subclass?: string; feats?: string[] };
  }>(
    "/api/level-up",
    async (req, reply) => {
      const sess = await registry.resolve(req);
      const actor = req.body?.actor;
      if (!actor) return reply.code(400).send({ error: "missing actor" });
      const gs = sess.manager.buildGameState();
      const before = sess.manager.session.log.length;

      const lv = await sess.manager.applyTool(gs, "level_up", { actor });
      if (!lv.ok) return reply.code(400).send({ error: lv.error });
      // The engine signals a refused level-up (e.g. not enough XP) by returning
      // an `{ error }` result rather than throwing, so `lv.ok` stays true. Surface
      // it as a 400 so the UI shows the reason instead of closing silently (#7).
      const lvErr = (lv.result as { error?: string } | undefined)?.error;
      if (typeof lvErr === "string") return reply.code(400).send({ error: lvErr });
      if (req.body?.subclass) {
        const r = await sess.manager.applyTool(gs, "choose_subclass", { actor, subclass: req.body.subclass });
        if (!r.ok) return reply.code(400).send({ error: r.error });
      }
      if (req.body?.asi && Object.keys(req.body.asi).length) {
        const r = await sess.manager.applyTool(gs, "ability_increase", { actor, increments: req.body.asi });
        if (!r.ok) return reply.code(400).send({ error: r.error });
      }
      if (Array.isArray(req.body?.feats) && req.body.feats.length) {
        await sess.manager.applyTool(gs, "grant_feat", { actor, feats: req.body.feats });
      }
      if (Array.isArray(req.body?.spells) && req.body.spells.length) {
        await sess.manager.applyTool(gs, "learn_spell", { actor, spells: req.body.spells });
      }

      for (const entry of sess.manager.session.log.slice(before)) sess.bus.emit({ type: "log", entry });
      // Level-up is a durable sheet change; persist notes and reload in place.
      await sess.manager.flushDurable(gs);
      await sess.reopen();
      sess.bus.emit({ type: "reload", reason: "level-up" });
      return { ok: true, result: lv.result };
    },
  );

  /** Full scene + state snapshot for initial client hydration. */
  app.get("/api/state", async (req) => {
    const sess = await registry.resolve(req);
    // The current model + any alternates, so the chat's "Jiným modelem" re-roll
    // (#54) can offer a picker without a separate round-trip.
    const stored = await loadSettings(config.vaultPath);
    return {
      campaign: sess.manager.campaign.config,
      session: sess.manager.session,
      actors: sess.manager.campaign.actors,
      locations: sess.manager.campaign.locations,
      encounters: sess.manager.campaign.encounters,
      items: sess.manager.campaign.items,
      lore: sess.manager.campaign.lore,
      factions: sess.manager.campaign.factions,
      npcs: sess.manager.campaign.npcs,
      worldEvents: sess.manager.campaign.worldEvents,
      models: {
        current: config.llm.model,
        alts: stored.llm?.altModels ?? [],
        // Operator-managed model pool (#56g): name + slug + per-message credit
        // price + 1–5 star intelligence/price ratings, for the player picker.
        pool: config.modelPool.map((m) => ({
          name: m.name,
          model: m.model,
          perMessage: m.perMessage,
          intelligence: m.intelligence,
          price: m.price,
          tooltip: m.tooltip ?? "",
        })),
      },
    };
  });

  /** Instantiate an authored encounter into live combat, then auto-resolve AI. */
  app.post<{ Params: { id: string } }>("/api/encounter/:id", async (req, reply) => {
    const sess = await registry.resolve(req);
    const llm = makeLlm(sess.manager);
    const gs = sess.manager.buildGameState();
    const before = sess.manager.session.log.length;
    const res = await startEncounter(sess.manager, gs, req.params.id);
    if (!res.ok) return reply.code(400).send({ error: res.error });
    for (const entry of sess.manager.session.log.slice(before)) {
      sess.bus.emit({ type: "log", entry });
    }
    await sess.manager.checkpoint(gs);
    sess.bus.emit({ type: "state", state: sess.manager.session });
    await meteredTurn(req, "llm-ai-turns", llm, (l) => resolveAiTurns({ manager: sess.manager, llm: l, bus: sess.bus, gs }), { enforce: false });
    return res;
  });

  /** Serve a campaign asset (map images, etc.), path-confined to the campaign. */
  app.get<{ Params: { "*": string } }>("/api/asset/*", async (req, reply) => {
    const sess = await registry.resolve(req);
    const rel = req.params["*"] ?? "";
    const base = path.resolve(sess.manager.campaign.dir);
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
  app.post("/api/intro", async (req, reply) => {
    const sess = await registry.resolve(req);
    const llm = makeLlm(sess.manager);
    const hasHistory = sess.manager.session.chat.some(
      (m) => m.role === "user" || m.role === "assistant",
    );
    if (hasHistory || sess.manager.session.ending) return { started: false };
    try {
      const { intro } = await meteredTurn(req, "llm-intro", llm, (l) =>
        runIntro({ manager: sess.manager, llm: l, bus: sess.bus }),
      );
      return { started: true, intro };
    } catch (err) {
      if (err instanceof InsufficientCreditsError) return reply.code(402).send({ error: err.message });
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Generate a "previously on…" recap of the story so far (§6.6). */
  app.post("/api/recap", async (req, reply) => {
    const sess = await registry.resolve(req);
    const llm = makeLlm(sess.manager);
    try {
      return await meteredTurn(req, "llm-recap", llm, (l) =>
        runRecap({ manager: sess.manager, llm: l, bus: sess.bus }),
      );
    } catch (err) {
      if (err instanceof InsufficientCreditsError) return reply.code(402).send({ error: err.message });
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** The append-only human-readable session diary (handoff/inspection, §6.6). */
  app.get("/api/log", async (req) => {
    const sess = await registry.resolve(req);
    const file = path.join(sess.manager.campaign.dir, "state", "session-log.md");
    try {
      const text = await fs.readFile(file, "utf8");
      return { exists: true, text };
    } catch {
      return { exists: false, text: "" };
    }
  });

  /** Read-only: cells the actor can reach this turn (for grid highlighting). */
  app.get<{ Params: { actor: string } }>("/api/reachable/:actor", async (req) => {
    const sess = await registry.resolve(req);
    const gs = sess.manager.buildGameState();
    const result = await sess.manager.applyTool(gs, "reachable", { actor: req.params.actor });
    return result.ok ? result.result : { cells: [], budget: 0 };
  });

  /** Player free-text action → the LLM/engine turn loop. */
  app.post<{ Body: { input: string; as?: string } }>("/api/action", async (req, reply) => {
    const sess = await registry.resolve(req);
    // Drive the turn with the player's chosen pool model (#56g) when set, so
    // billing also keys off that model's per-message price.
    const selectedModel = await resolveSelectedModel(sess);
    const llm = makeLlm(sess.manager, selectedModel);
    const input = (req.body?.input ?? "").trim();
    if (!input) return reply.code(400).send({ error: "empty input" });
    // A finished campaign (party wipe, #23) accepts no further actions until
    // the player rolls back to an earlier snapshot.
    if (sess.manager.session.ending)
      return reply.code(409).send({ error: sess.manager.session.ending.reason });
    try {
      // Checkpoint the pre-turn state so the player can undo this message.
      await checkpointTurn(sess.manager.campaign.dir, `Před: „${input.slice(0, 40)}“`);
      const partyVoice = req.body?.as === "party";
      const { narration } = await meteredTurn(
        req,
        "llm-turn",
        llm,
        (l) => runTurn({ manager: sess.manager, llm: l, bus: sess.bus, input, partyVoice }),
        { bill: true, model: selectedModel ?? config.llm.model },
      );
      return { narration };
    } catch (err) {
      if (err instanceof InsufficientCreditsError) return reply.code(402).send({ error: err.message });
      const message = err instanceof Error ? err.message : String(err);
      sess.bus.emit({ type: "error", message });
      return reply.code(500).send({ error: message });
    }
  });

  /**
   * Re-roll the last DM turn (#54). Drops the most recent turn (undo restores
   * the pre-turn checkpoint) and re-runs the player's prior action through the
   * DM loop, so a fresh narration is produced. `model` requests a one-off model
   * override for this single re-roll ("Jiným modelem") — same provider/key, only
   * the model name differs; it reuses the streaming tool-loop so determinism
   * (#12) is unaffected.
   */
  app.post<{ Body: { model?: string } }>("/api/regenerate", async (req, reply) => {
    const sess = await registry.resolve(req);
    // The player's last stated action — captured before the rewind wipes it.
    const lastUser = [...sess.manager.session.chat].reverse().find((m) => m.role === "user");
    if (!lastUser?.content) return reply.code(400).send({ error: "Není co přegenerovat — žádný předchozí tah." });
    const input = lastUser.content;
    const dir = sess.manager.campaign.dir;
    try {
      // Rewind to before the last turn (also clears an ending it may have caused),
      // re-open the manager on the rewound state, then re-checkpoint so the
      // regenerated turn can itself be undone.
      const undone = await undoLastTurn(dir);
      if (!undone) return reply.code(400).send({ error: "Není co přegenerovat — žádný předchozí tah." });
      await sess.reopen();
      await checkpointTurn(dir, `Před: „${input.slice(0, 40)}“`);
      // Build the narrator AFTER the rewind so the mock introspects the
      // rewound manager, not the stale one. With no explicit "Jiným modelem"
      // pick, default to the player's chosen pool model (#56g).
      const override = req.body?.model?.trim() || (await resolveSelectedModel(sess));
      const model = override || config.llm.model;
      const turnLlm = makeLlm(sess.manager, override || undefined);
      const { narration } = await meteredTurn(
        req,
        "llm-regenerate",
        turnLlm,
        (l) => runTurn({ manager: sess.manager, llm: l, bus: sess.bus, input }),
        { bill: true, model },
      );
      return { narration };
    } catch (err) {
      if (err instanceof InsufficientCreditsError) return reply.code(402).send({ error: err.message });
      const message = err instanceof Error ? err.message : String(err);
      sess.bus.emit({ type: "error", message });
      return reply.code(500).send({ error: message });
    }
  });

  /** Direct engine command (UI buttons: move token, cast spell, etc.) — no LLM. */
  app.post<{ Body: { tool: string; args: unknown } }>("/api/command", async (req, reply) => {
    const sess = await registry.resolve(req);
    const llm = makeLlm(sess.manager);
    const { tool, args } = req.body ?? { tool: "", args: {} };
    if (!tool) return reply.code(400).send({ error: "missing tool" });

    // Inject authored edge duration into travel args so the clock advances
    // even when the client only sends { to } (#41a). Only inject when the
    // client hasn't already supplied a duration.
    let enrichedArgs = args as Record<string, unknown>;
    if (tool === "travel") {
      const dest = (args as { to?: string }).to;
      const here = sess.manager.campaign.locations[sess.manager.session.current_location];
      const edge = dest ? (here?.connections ?? []).find((c) => c.to === dest) : undefined;
      const hasDuration = enrichedArgs.days !== undefined || enrichedArgs.hours !== undefined;
      if (edge?.travel?.days && !hasDuration) {
        enrichedArgs = { ...enrichedArgs, days: edge.travel.days };
      }
    }

    const gs = sess.manager.buildGameState();
    const before = sess.manager.session.log.length;
    const result = await sess.manager.applyTool(gs, tool, enrichedArgs);
    for (const entry of sess.manager.session.log.slice(before)) {
      sess.bus.emit({ type: "log", entry });
    }
    await sess.manager.checkpoint(gs);
    sess.bus.emit({ type: "state", state: sess.manager.session });

    // After successful travel, have the DM narrate the arrival scene (#41b).
    // These LLM follow-ups are metered but not balance-gated — the engine
    // command already ran; enforcement happens at the player-action boundary.
    if (tool === "travel" && result.ok) {
      await meteredTurn(req, "llm-arrival", llm, (l) => runArrival({ manager: sess.manager, llm: l, bus: sess.bus }), { enforce: false });
    } else {
      // For non-travel commands, auto-resolve AI turns as before (§8.3).
      await meteredTurn(req, "llm-ai-turns", llm, (l) => resolveAiTurns({ manager: sess.manager, llm: l, bus: sess.bus, gs }), { enforce: false });
    }

    return result;
  });

  /** SSE stream of game events (§13). */
  app.get("/api/events", async (req, reply) => {
    const sess = await registry.resolve(req);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(`event: ready\ndata: {}\n\n`);
    const unsubscribe = sess.bus.subscribe((event) => {
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
      const sess = await registry.resolve(req);
      const { subject, id } = req.body ?? {};
      if (!subject) return reply.code(400).send({ error: "Chybí subject" });
      try {
        enforceCredits(req);
        const prompt = buildPrompt(
          subject,
          sess.manager.campaign.actors,
          sess.manager.campaign.locations,
          sess.manager.session,
          id,
        );
        const client = new ImageClient(config.image);
        const result = await client.generate(prompt);
        chargeCredits(req, "image", config.credits.pricing.perImage);
        return result;
      } catch (err) {
        if (err instanceof InsufficientCreditsError) return reply.code(402).send({ error: err.message });
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
    try {
      enforceCredits(req);
    } catch (err) {
      if (err instanceof InsufficientCreditsError) return reply.code(402).send({ error: err.message });
      throw err;
    }
    const wav = await synthesizeTts(text, config.azureTts, provider);
    if (!wav) return reply.code(502).send({ error: "TTS upstream error" });
    chargeCredits(req, "tts", (text.length / 1000) * config.credits.pricing.perThousandTtsChars);
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
