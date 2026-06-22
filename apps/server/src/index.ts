import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { loadConfig } from "./config.js";
import { EventBus } from "./session/events.js";
import { SessionManager } from "./session/manager.js";
import { registerGameRoutes } from "./routes/game.js";

async function findCampaignDir(vaultPath: string): Promise<string> {
  const explicit = process.env.CAMPAIGN;
  const campaignsRoot = path.join(vaultPath, "campaigns");
  if (explicit) return path.join(campaignsRoot, explicit);
  const entries = await fs.readdir(campaignsRoot, { withFileTypes: true });
  const first = entries.find((e) => e.isDirectory());
  if (!first) throw new Error(`No campaigns found in ${campaignsRoot}`);
  return path.join(campaignsRoot, first.name);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const app = Fastify({ logger: true });

  if (config.basicAuth) {
    const expected = "Basic " + Buffer.from(config.basicAuth).toString("base64");
    app.addHook("onRequest", async (req, reply) => {
      if (req.headers.authorization !== expected) {
        reply.header("WWW-Authenticate", 'Basic realm="adm"').code(401).send("Unauthorized");
      }
    });
  }

  const campaignDir = await findCampaignDir(config.vaultPath);
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
