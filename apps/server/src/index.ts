import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { applySettings, loadConfig, type Config } from "./config.js";
import { loadSettings } from "./settings.js";
import { registerGameRoutes } from "./routes/game.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { openDatabase, checkpointDatabase } from "./db/database.js";
import { UserStore } from "./auth/users.js";
import { SessionStore } from "./auth/sessions.js";
import { AuditStore } from "./auth/audit.js";
import { CreditStore } from "./credits/ledger.js";
import { registerCreditRoutes } from "./routes/credits.js";
import { loadOrCreateSecret } from "./auth/tokens.js";
import { LogEmailSender, SmtpEmailSender, type EmailSender } from "./auth/email.js";
import { AuthService } from "./auth/service.js";
import { registerAuthGuard, registerCsrfGuard } from "./auth/middleware.js";
import { RateLimiter } from "./auth/rate-limit.js";
import { applyPendingRestore } from "./admin/ops.js";

async function main(): Promise<void> {
  const startedAtMs = Date.now();
  const env = loadConfig();
  const settings = await loadSettings(env.vaultPath);
  const config = applySettings(env, settings);
  const app = Fastify({ logger: true });

  // Single window into the live, mutable config. Game routes own the canonical
  // value and call `exposeConfig` to wire these handles; until then they read
  // the boot config. The auth guard/flags and admin panel read through this so
  // an operational-settings change (#57b) is honoured everywhere without a
  // restart, while still persisting in the vault.
  let configAccess: { get: () => Config; reload: () => Promise<Config> } = {
    get: () => config,
    reload: async () => config,
  };
  // Late-bound by the game routes (which own the session registry, #59e). Until
  // then a deleted account just drops its DB row; once wired it also purges the
  // user's vault subtree and evicts their cached scope.
  let purgeUserScope: (userId: string) => Promise<void> = async () => {};
  // Late-bound likewise (#59d): drop a scope's cached manager after the admin
  // panel deletes a campaign in it, so the next turn re-opens fresh.
  let invalidateScope: (scopeKey: string, reason: string) => Promise<void> = async () => {};

  if (config.basicAuth) {
    const expected = "Basic " + Buffer.from(config.basicAuth).toString("base64");
    app.addHook("onRequest", async (req, reply) => {
      if (req.headers.authorization !== expected) {
        reply.header("WWW-Authenticate", 'Basic realm="adm"').code(401).send("Unauthorized");
      }
    });
  }

  // A staged restore (#59c) is swapped in here, before anything opens the DB or
  // reads vault data, so the SQLite handle below sees the restored file.
  if (await applyPendingRestore(config.vaultPath, (msg) => app.log.warn(msg))) {
    app.log.info("Vault restored from a staged backup at startup.");
  }

  // Accounts (#55): app DB + auth service. File-first SQLite in the vault.
  await app.register(fastifyCookie);
  const db = openDatabase(config.vaultPath);
  const users = new UserStore(db);
  const sessions = new SessionStore(db);
  const audit = new AuditStore(db);
  const credits = new CreditStore(db);
  sessions.pruneExpired();
  const secret = loadOrCreateSecret(config.vaultPath);
  const emailSender: EmailSender = config.auth.smtp
    ? new SmtpEmailSender(config.auth.smtp)
    : new LogEmailSender(app.log);
  const authService = new AuthService(users, sessions, emailSender, {
    secret,
    publicUrl: config.auth.publicUrl,
    adminEmail: config.auth.adminEmail,
    requireVerifiedEmail: () => configAccess.get().auth.requireVerifiedEmail,
  });
  // Promote the designated operator to admin if they already registered (#57).
  const admin = authService.ensureAdmin();
  if (admin) app.log.info(`Admin role ensured for ${admin.email}`);
  // Reject cross-site state-changing requests (#59a) before any handler runs.
  registerCsrfGuard(app);
  // Resolve req.user from the session and gate protected routes (#55f part 1).
  // Getters so a live config change (admin panel, #57b) is honoured per request.
  registerAuthGuard(app, {
    service: authService,
    allowAnonymous: () => configAccess.get().auth.allowAnonymous,
  });
  // Brute-force throttles for the credential endpoints (#59b). A `max` of 0
  // disables a limit; the limiter then never blocks. Pruned periodically so the
  // keyed-by-IP map can't grow without bound.
  const loginLimit = config.auth.rateLimit.login;
  const registerLimit = config.auth.rateLimit.register;
  const rateLimit =
    loginLimit.max > 0 || registerLimit.max > 0
      ? {
          login: new RateLimiter({
            max: loginLimit.max > 0 ? loginLimit.max : Infinity,
            windowMs: loginLimit.windowMs,
          }),
          register: new RateLimiter({
            max: registerLimit.max > 0 ? registerLimit.max : Infinity,
            windowMs: registerLimit.windowMs,
          }),
        }
      : undefined;
  if (rateLimit) {
    const pruneTimer = setInterval(
      () => {
        rateLimit.login.prune();
        rateLimit.register.prune();
      },
      10 * 60 * 1000,
    );
    pruneTimer.unref();
  }
  await registerAuthRoutes(app, {
    service: authService,
    cookieSecure: config.auth.publicUrl.startsWith("https://"),
    rateLimit,
    onAccountDeleted: (userId) => purgeUserScope(userId),
    flags: () => {
      const c = configAccess.get();
      return {
        allowAnonymous: c.auth.allowAnonymous,
        registrationEnabled: c.auth.registrationEnabled,
        creditsEnabled: c.credits.enabled,
      };
    },
  });
  await registerAdminRoutes(app, {
    users,
    sessions,
    audit,
    credits,
    vaultPath: config.vaultPath,
    getConfig: () => configAccess.get(),
    reloadConfig: () => configAccess.reload(),
    onScopeDataChanged: (scopeKey, reason) => invalidateScope(scopeKey, reason),
    checkpointDb: () => checkpointDatabase(db),
    backupRetention: config.backups.retention,
    startedAtMs,
  });
  await registerCreditRoutes(app, { credits });

  // The game layer resolves a SessionManager per scope (shared vault when
  // anonymous, <vault>/users/<id> per user when accounts are on, #55f). The
  // registry is owned by the game routes; in self-hosted mode it eager-opens
  // the shared scope at registration so a vault with no campaigns still fails
  // fast at boot, exactly as before.
  await registerGameRoutes(app, {
    config,
    credits,
    exposeConfig: (access) => {
      configAccess = access;
    },
    exposePurgeUserScope: (purge) => {
      purgeUserScope = purge;
    },
    exposeInvalidateScope: (invalidate) => {
      invalidateScope = invalidate;
    },
  });

  app.get("/api/health", async () => ({ ok: true }));

  // Serve the built web client if present (single-port deployment, §14.1).
  const webDist =
    config.webDist ?? fileURLToPath(new URL("../../web/dist", import.meta.url));
  try {
    await fs.access(webDist);
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html");
    });
  } catch {
    app.log.warn(`Web build not found at ${webDist}; serving API only`);
  }

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
