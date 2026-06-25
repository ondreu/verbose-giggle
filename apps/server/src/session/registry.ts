/**
 * Per-user game-state isolation (#55f part 2).
 *
 * Today's server runs a single shared `SessionManager` + `EventBus`. This
 * registry resolves a *scope* per request instead:
 *   - **Hosted / multi-tenant** (`allowAnonymous === false`): each signed-in
 *     user gets their own `<vault>/users/<id>/` subtree — own campaigns, worlds,
 *     session state, and event stream.
 *   - **Self-hosted / anonymous** (`allowAnonymous === true`): a single
 *     `__shared__` scope rooted at the vault, byte-for-byte the legacy behaviour
 *     so existing deployments (#50) run unchanged.
 *
 * Each scope's `EventBus` is durable; its `SessionManager` is lazily opened and
 * re-openable (campaign hot-swap, SRD remount). Resolution memoizes the
 * in-flight open *promise* so concurrent first-touch requests share one open
 * (and one seed) rather than racing on disk.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import { loadSettings } from "../settings.js";
import { createCampaign } from "../vault/scaffold.js";
import { migrateLegacyVaultToUser } from "../vault/migrate-user.js";
import { EventBus } from "./events.js";
import { SessionManager } from "./manager.js";

export const SHARED_SCOPE = "__shared__";

/**
 * Pick the campaign dir to open under a vault root. Honours an explicit
 * selection (settings/env) and otherwise falls back to the first folder found.
 * Returns null when the root has no `campaigns/` folder or it is empty.
 */
async function findCampaignDir(root: string, explicit?: string): Promise<string | null> {
  const campaignsRoot = path.join(root, "campaigns");
  if (explicit) {
    const dir = path.join(campaignsRoot, explicit);
    try {
      await fs.access(path.join(dir, "campaign.yaml"));
      return dir;
    } catch {
      /* selected campaign gone — fall through to discovery */
    }
  }
  let entries;
  try {
    entries = await fs.readdir(campaignsRoot, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const first = entries.find((e) => e.isDirectory());
  return first ? path.join(campaignsRoot, first.name) : null;
}

/**
 * One resolved scope: a durable event bus plus a (re)openable SessionManager,
 * both rooted at `root` (the vault for shared scope, `<vault>/users/<id>` for a
 * user scope). Handlers MUST read `manager` through this object (never alias it
 * into a local before an operation that can `reopen()`), so a hot-swap is seen.
 */
export class UserSession {
  /** Re-assigned by {@link reopen}; read it through `sess.manager` each time. */
  manager!: SessionManager;
  readonly bus = new EventBus();

  constructor(
    readonly key: string,
    readonly root: string,
    private getSrdDir: () => string,
  ) {}

  get isShared(): boolean {
    return this.key === SHARED_SCOPE;
  }

  /** A path inside this scope's vault root (campaigns/worlds/assets/…). */
  scopedPath(...segments: string[]): string {
    return path.join(this.root, ...segments);
  }

  /** Re-open the manager, optionally switching to a different campaign folder. */
  async reopen(folder?: string): Promise<void> {
    const dir = folder ? this.scopedPath("campaigns", folder) : this.manager.campaign.dir;
    this.manager = await SessionManager.open(dir, { srdDir: this.getSrdDir() });
  }
}

export class SessionRegistry {
  private scopes = new Map<string, Promise<UserSession>>();
  /**
   * Data-isolation routing is latched at boot (#59f). Flipping `allowAnonymous`
   * live (admin panel) changes the auth *gate* (whether login is required) right
   * away, but switching scope routing mid-session would tear a player out of the
   * vault they're playing — shared ⇄ per-user — under their feet. So the routing
   * decision uses this boot snapshot and only changes on restart; the admin UI
   * warns when the live setting has drifted from it.
   */
  private readonly bootAllowAnonymous: boolean;

  constructor(private deps: { getConfig: () => Config }) {
    this.bootAllowAnonymous = deps.getConfig().auth.allowAnonymous;
  }

  /** True when each signed-in user gets isolated data (hosted edition). */
  isolationEnabled(): boolean {
    return this.bootAllowAnonymous === false;
  }

  private keyAndRoot(req: FastifyRequest): { key: string; root: string } {
    const cfg = this.deps.getConfig();
    if (this.isolationEnabled() && req.user) {
      return { key: req.user.id, root: path.join(cfg.vaultPath, "users", req.user.id) };
    }
    return { key: SHARED_SCOPE, root: cfg.vaultPath };
  }

  /** Resolve (opening lazily) the scope for this request. */
  async resolve(req: FastifyRequest): Promise<UserSession> {
    const { key, root } = this.keyAndRoot(req);
    return this.acquire(key, root, req.user ?? null);
  }

  /**
   * Eagerly open the shared scope (self-hosted boot validation). Throws the
   * same helpful error as before when the vault has no campaigns.
   */
  async openShared(): Promise<UserSession> {
    return this.acquire(SHARED_SCOPE, this.deps.getConfig().vaultPath, null);
  }

  private acquire(key: string, root: string, user: FastifyRequest["user"]): Promise<UserSession> {
    let existing = this.scopes.get(key);
    if (!existing) {
      existing = this.openScope(key, root, user).catch((err) => {
        this.scopes.delete(key); // let a retry re-attempt instead of caching the failure
        throw err;
      });
      this.scopes.set(key, existing);
    }
    return existing;
  }

  private async openScope(
    key: string,
    root: string,
    user: FastifyRequest["user"],
  ): Promise<UserSession> {
    const cfg = this.deps.getConfig();
    const isShared = key === SHARED_SCOPE;

    // The designated operator's first touch pulls the legacy vault into their
    // own subtree (#55f decision 3). Runs inside this memoized promise, so two
    // concurrent admin requests never both migrate.
    if (!isShared && user && this.isDesignatedAdmin(user, cfg)) {
      await migrateLegacyVaultToUser(cfg.vaultPath, root);
    }

    const sess = new UserSession(key, root, () => this.deps.getConfig().srdPath);
    const stored = await loadSettings(root);
    const explicit = stored.campaign ?? (isShared ? process.env.CAMPAIGN : undefined);
    let dir = await findCampaignDir(root, explicit);
    if (!dir) {
      if (isShared) {
        throw new Error(
          `Vault has no campaigns/ folder at ${path.join(root, "campaigns")}. ` +
            `Point VAULT_PATH at a vault that contains campaigns/, or seed one ` +
            `(e.g. copy data/vault.example/* into it).`,
        );
      }
      // A brand-new user: seed a minimal starter so a manager always exists.
      const folder = await createCampaign(root, { name: "Nová kampaň" });
      dir = path.join(root, "campaigns", folder);
    }
    sess.manager = await SessionManager.open(dir, { srdDir: cfg.srdPath });
    return sess;
  }

  private isDesignatedAdmin(user: NonNullable<FastifyRequest["user"]>, cfg: Config): boolean {
    return (
      user.role === "admin" &&
      cfg.auth.adminEmail != null &&
      user.email.toLowerCase() === cfg.auth.adminEmail
    );
  }

  /**
   * Forget a cached scope so its next resolve re-opens from disk (#59d/#59e).
   * Used after a scope's data is deleted (account removal, campaign delete), so
   * a stale in-memory `SessionManager` pointing at a now-gone directory can't be
   * reused. No-op if the scope was never opened.
   */
  evict(key: string): void {
    this.scopes.delete(key);
  }

  /**
   * Invalidate one scope after its on-disk data changed under it (#59d, e.g. an
   * admin deleted a campaign in that scope). Tells any connected clients to
   * re-hydrate, then drops the cached scope so its next request re-opens from
   * disk (re-discovering a campaign / seeding) instead of serving a stale
   * `SessionManager` that may point at a deleted directory. No-op if the scope
   * was never opened.
   */
  async invalidateScope(key: string, reason: string): Promise<void> {
    const pending = this.scopes.get(key);
    if (!pending) return;
    try {
      (await pending).bus.emit({ type: "reload", reason });
    } catch {
      /* a scope that failed to open has no clients to notify */
    }
    this.scopes.delete(key);
  }

  /**
   * Re-open every live scope's manager (e.g. the global SRD path changed) and
   * tell each scope's clients to re-hydrate. A single bus emit would only reach
   * the shared scope, so we fan out per-bus.
   */
  async invalidateAll(reason: string): Promise<void> {
    for (const pending of this.scopes.values()) {
      let sess: UserSession;
      try {
        sess = await pending;
      } catch {
        continue; // a scope that failed to open has nothing to reload
      }
      await sess.reopen();
      sess.bus.emit({ type: "reload", reason });
    }
  }
}
