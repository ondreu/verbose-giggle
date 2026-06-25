import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { applySettings, loadConfig } from "./config.js";
import { loadSettings } from "./settings.js";
import { registerGameRoutes } from "./routes/game.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { openDatabase } from "./db/database.js";
import { UserStore } from "./auth/users.js";
import { SessionStore } from "./auth/sessions.js";
import { AuditStore } from "./auth/audit.js";
import { CreditStore } from "./credits/ledger.js";
import { registerCreditRoutes } from "./routes/credits.js";
import { loadOrCreateSecret } from "./auth/tokens.js";
import { LogEmailSender, SmtpEmailSender, type EmailSender } from "./auth/email.js";
import { AuthService } from "./auth/service.js";
import { registerAuthGuard } from "./auth/middleware.js";

async function main(): Promise<void> {
  const env = loadConfig();
  const settings = await loadSettings(env.vaultPath);
  const config = applySettings(env, settings);
  const app = Fastify({ logger: true });

  if (config.basicAuth) {
    const expected = "Basic " + Buffer.from(config.basicAuth).toString("base64");
    app.addHook("onRequest", async (req, reply) => {
      if (req.headers.authorization !== expected) {
        reply.header("WWW-Authenticate", 'Basic realm="adm"').code(401).send("Unauthorized");
      }
    });
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
  });
  // Promote the designated operator to admin if they already registered (#57).
  const admin = authService.ensureAdmin();
  if (admin) app.log.info(`Admin role ensured for ${admin.email}`);
  // Resolve req.user from the session and gate protected routes (#55f part 1).
  registerAuthGuard(app, { service: authService, allowAnonymous: config.auth.allowAnonymous });
  await registerAuthRoutes(app, {
    service: authService,
    cookieSecure: config.auth.publicUrl.startsWith("https://"),
    flags: {
      allowAnonymous: config.auth.allowAnonymous,
      registrationEnabled: config.auth.registrationEnabled,
      creditsEnabled: config.credits.enabled,
    },
  });
  await registerAdminRoutes(app, { users, sessions, audit, credits });
  await registerCreditRoutes(app, { credits });

  // The game layer resolves a SessionManager per scope (shared vault when
  // anonymous, <vault>/users/<id> per user when accounts are on, #55f). The
  // registry is owned by the game routes; in self-hosted mode it eager-opens
  // the shared scope at registration so a vault with no campaigns still fails
  // fast at boot, exactly as before.
  await registerGameRoutes(app, { config, credits });

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
