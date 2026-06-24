import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { applySettings, loadConfig } from "./config.js";
import { loadSettings } from "./settings.js";
import { EventBus } from "./session/events.js";
import { SessionManager } from "./session/manager.js";
import { registerGameRoutes } from "./routes/game.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { openDatabase } from "./db/database.js";
import { UserStore } from "./auth/users.js";
import { SessionStore } from "./auth/sessions.js";
import { loadOrCreateSecret } from "./auth/tokens.js";
import { LogEmailSender, SmtpEmailSender, type EmailSender } from "./auth/email.js";
import { AuthService } from "./auth/service.js";

async function findCampaignDir(vaultPath: string, selected?: string): Promise<string> {
  // Precedence: GUI setting → CAMPAIGN env → first folder found.
  const explicit = selected || process.env.CAMPAIGN;
  const campaignsRoot = path.join(vaultPath, "campaigns");
  if (explicit) return path.join(campaignsRoot, explicit);
  let entries;
  try {
    entries = await fs.readdir(campaignsRoot, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Vault has no campaigns/ folder at ${campaignsRoot}. ` +
          `Point VAULT_PATH at a vault that contains campaigns/, or seed one ` +
          `(e.g. copy data/vault.example/* into it).`,
      );
    }
    throw err;
  }
  const first = entries.find((e) => e.isDirectory());
  if (!first) throw new Error(`No campaigns found in ${campaignsRoot}`);
  return path.join(campaignsRoot, first.name);
}

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
  sessions.pruneExpired();
  const secret = loadOrCreateSecret(config.vaultPath);
  const emailSender: EmailSender = config.auth.smtp
    ? new SmtpEmailSender(config.auth.smtp)
    : new LogEmailSender(app.log);
  const authService = new AuthService(users, sessions, emailSender, {
    secret,
    publicUrl: config.auth.publicUrl,
  });
  await registerAuthRoutes(app, {
    service: authService,
    cookieSecure: config.auth.publicUrl.startsWith("https://"),
  });

  const campaignDir = await findCampaignDir(config.vaultPath, settings.campaign);
  app.log.info(`Loading campaign from ${campaignDir}`);
  const manager = await SessionManager.open(campaignDir, { srdDir: config.srdPath });
  const bus = new EventBus();

  await registerGameRoutes(app, { manager, bus, config });

  app.get("/api/health", async () => ({ ok: true, campaign: manager.campaign.config.name }));

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
