import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import { openInMemoryDatabase } from "../src/db/database.js";
import { UserStore } from "../src/auth/users.js";
import { SessionStore } from "../src/auth/sessions.js";
import { AuthService } from "../src/auth/service.js";
import { registerAuthGuard } from "../src/auth/middleware.js";
import { registerGameRoutes } from "../src/routes/game.js";
import { hashPassword } from "../src/auth/password.js";
import { loadConfig, bundledSrdDir, type Config } from "../src/config.js";
import { createCampaign } from "../src/vault/scaffold.js";
import { SessionRegistry } from "../src/session/registry.js";

const tmpDirs: string[] = [];
async function freshVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "adm-iso-"));
  tmpDirs.push(root);
  return path.join(root, "vault");
}
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

/** Effective config for a test app: offline mock narrator, no metering. */
function testConfig(vaultPath: string, allowAnonymous: boolean, adminEmail?: string): Config {
  const base = loadConfig();
  return {
    ...base,
    vaultPath,
    srdPath: bundledSrdDir,
    image: null,
    azureTts: null,
    piperUrl: null,
    basicAuth: null,
    llm: { ...base.llm, apiKey: "", provider: "mock" },
    auth: { ...base.auth, allowAnonymous, adminEmail: adminEmail ?? null },
    credits: { ...base.credits, enabled: false },
  };
}

interface TestApp {
  app: FastifyInstance;
  service: AuthService;
  users: UserStore;
}

async function buildApp(vaultPath: string, allowAnonymous: boolean, adminEmail?: string): Promise<TestApp> {
  const db = openInMemoryDatabase();
  const users = new UserStore(db);
  const sessions = new SessionStore(db);
  const service = new AuthService(users, sessions, { send: async () => {} }, {
    secret: "test-secret",
    publicUrl: "http://localhost",
    adminEmail,
  });
  const app = Fastify();
  await app.register(fastifyCookie);
  registerAuthGuard(app, { service, allowAnonymous });
  await registerGameRoutes(app, { config: testConfig(vaultPath, allowAnonymous, adminEmail), credits: null });
  await app.ready();
  return { app, service, users };
}

/** Create a verified user and return their session cookie value. */
async function cookieFor(
  t: TestApp,
  email: string,
  role: "user" | "admin" = "user",
): Promise<string> {
  const passwordHash = await hashPassword("Abcd1234");
  t.users.create({ email, passwordHash, emailVerified: true, role });
  const { session } = await t.service.login(email, "Abcd1234");
  return session.id;
}

const COOKIE = (sid: string) => ({ adm_session: sid });

describe("per-user data isolation (#55f part 2)", () => {
  it("isolates campaigns between users (a user never sees another's data)", async () => {
    const vault = await freshVault();
    const t = await buildApp(vault, false);
    const a = await cookieFor(t, "a@example.com");
    const b = await cookieFor(t, "b@example.com");

    // User A creates a campaign.
    const created = await t.app.inject({
      method: "POST",
      url: "/api/campaigns",
      cookies: COOKIE(a),
      payload: { name: "Tajná kampaň A", select: true },
    });
    expect(created.statusCode).toBe(200);
    const aFolder = created.json().folder as string;

    // User B's campaign list must not contain A's folder.
    const bList = await t.app.inject({ method: "GET", url: "/api/campaigns", cookies: COOKIE(b) });
    expect(bList.statusCode).toBe(200);
    const bFolders = (bList.json().campaigns as { folder: string }[]).map((c) => c.folder);
    expect(bFolders).not.toContain(aFolder);

    // B cannot read or delete A's campaign by folder name.
    const bRead = await t.app.inject({ method: "GET", url: `/api/campaigns/${aFolder}/files`, cookies: COOKIE(b) });
    expect(bRead.statusCode).toBe(404);
    const bDelete = await t.app.inject({ method: "DELETE", url: `/api/campaigns/${aFolder}`, cookies: COOKIE(b) });
    expect(bDelete.statusCode).toBe(404);

    // The data physically lives under each user's own subtree.
    const aId = t.users.findByEmail("a@example.com")!.id;
    await expect(fs.access(path.join(vault, "users", aId, "campaigns", aFolder))).resolves.toBeUndefined();
    await t.app.close();
  });

  it("seeds a starter campaign for a brand-new user", async () => {
    const vault = await freshVault();
    const t = await buildApp(vault, false);
    const u = await cookieFor(t, "new@example.com");
    const res = await t.app.inject({ method: "GET", url: "/api/state", cookies: COOKIE(u) });
    expect(res.statusCode).toBe(200);
    expect(res.json().campaign?.name).toBe("Nová kampaň");
    await t.app.close();
  });

  it("opens a scope only once under concurrent first-touch (no double seed)", async () => {
    const vault = await freshVault();
    const t = await buildApp(vault, false);
    const u = await cookieFor(t, "race@example.com");
    const [r1, r2] = await Promise.all([
      t.app.inject({ method: "GET", url: "/api/state", cookies: COOKIE(u) }),
      t.app.inject({ method: "GET", url: "/api/state", cookies: COOKIE(u) }),
    ]);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    const id = t.users.findByEmail("race@example.com")!.id;
    const entries = await fs.readdir(path.join(vault, "users", id, "campaigns"));
    expect(entries).toHaveLength(1); // exactly one seed, not two
    await t.app.close();
  });

  it("leaves the single shared vault unchanged when anonymous access is on", async () => {
    const vault = await freshVault();
    await createCampaign(vault, { name: "Sdílená kampaň" });
    const t = await buildApp(vault, true);

    // No cookie — anonymous reads the shared campaign, exactly as before.
    const list = await t.app.inject({ method: "GET", url: "/api/campaigns" });
    expect(list.statusCode).toBe(200);
    expect((list.json().campaigns as { folder: string }[]).map((c) => c.folder)).toContain("sdilena-kampan");
    const state = await t.app.inject({ method: "GET", url: "/api/state" });
    expect(state.statusCode).toBe(200);
    expect(state.json().campaign?.name).toBe("Sdílená kampaň");

    // No per-user subtree is ever created in shared mode.
    await expect(fs.access(path.join(vault, "users"))).rejects.toBeTruthy();
    await t.app.close();
  });

  it("migrates the legacy vault into the designated admin's subtree, once", async () => {
    const vault = await freshVault();
    // Seed a legacy single-tenant vault: campaigns + a world + a selection.
    await createCampaign(vault, { name: "Stará kampaň", folder: "legacy" });
    await fs.mkdir(path.join(vault, "worlds", "stary-svet"), { recursive: true });
    await fs.writeFile(path.join(vault, "worlds", "stary-svet", "WORLD.md"), "# Starý svět\n", "utf8");
    await fs.writeFile(path.join(vault, "settings.json"), JSON.stringify({ campaign: "legacy", llm: { apiKey: "k" } }), "utf8");

    const t = await buildApp(vault, false, "admin@example.com");
    const admin = await cookieFor(t, "admin@example.com", "admin");
    const adminId = t.users.findByEmail("admin@example.com")!.id;

    const first = await t.app.inject({ method: "GET", url: "/api/campaigns", cookies: COOKIE(admin) });
    expect(first.statusCode).toBe(200);
    expect((first.json().campaigns as { folder: string }[]).map((c) => c.folder)).toContain("legacy");

    // Legacy data moved into the admin's subtree; root campaigns/worlds gone.
    await expect(fs.access(path.join(vault, "users", adminId, "campaigns", "legacy"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(vault, "users", adminId, "worlds", "stary-svet"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(vault, "users", adminId, ".migrated-from-root"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(vault, "campaigns"))).rejects.toBeTruthy();
    // The campaign selection is copied per-user; provider creds stay global.
    const userSettings = JSON.parse(await fs.readFile(path.join(vault, "users", adminId, "settings.json"), "utf8"));
    expect(userSettings.campaign).toBe("legacy");
    const globalSettings = JSON.parse(await fs.readFile(path.join(vault, "settings.json"), "utf8"));
    expect(globalSettings.llm?.apiKey).toBe("k");

    // A second request is a no-op (no error, marker still present).
    const second = await t.app.inject({ method: "GET", url: "/api/campaigns", cookies: COOKIE(admin) });
    expect(second.statusCode).toBe(200);
    await t.app.close();
  });

  it("keeps a scope's event bus alive across a manager reopen", async () => {
    const vault = await freshVault();
    await createCampaign(vault, { name: "Bus test" });
    let config = testConfig(vault, true);
    const registry = new SessionRegistry({ getConfig: () => config });
    const sess = await registry.openShared();
    const bus = sess.bus;
    const seen: string[] = [];
    sess.bus.subscribe((e) => {
      if (e.type === "reload") seen.push(e.reason);
    });
    await sess.reopen(); // hot-swap the manager
    expect(sess.bus).toBe(bus); // same durable bus instance
    sess.bus.emit({ type: "reload", reason: "after-reopen" });
    expect(seen).toContain("after-reopen");
  });
});
