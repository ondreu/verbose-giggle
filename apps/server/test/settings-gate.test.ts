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

/**
 * Global provider/SRD credentials in PUT /api/settings are admin-only in hosted
 * mode (anonymous access off), open in self-hosted. The per-user campaign
 * selection is never gated. GET surfaces `canEditProviders` so the UI can hide
 * the provider fields for a regular tenant.
 */
const tmpDirs: string[] = [];
async function freshVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "adm-setgate-"));
  tmpDirs.push(root);
  return path.join(root, "vault");
}
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

function testConfig(vaultPath: string, allowAnonymous: boolean): Config {
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
    auth: { ...base.auth, allowAnonymous, adminEmail: null },
    credits: { ...base.credits, enabled: false },
    modelPool: [
      { name: "Rychlý", model: "fast/slug", perMessage: 20, intelligence: 2, price: 1, tooltip: "" },
      { name: "Chytrý", model: "smart/slug", perMessage: 300, intelligence: 5, price: 4, tooltip: "" },
    ],
  };
}

interface TestApp {
  app: FastifyInstance;
  service: AuthService;
  users: UserStore;
}

async function buildApp(vaultPath: string, allowAnonymous: boolean): Promise<TestApp> {
  const db = openInMemoryDatabase();
  const users = new UserStore(db);
  const sessions = new SessionStore(db);
  const service = new AuthService(users, sessions, { send: async () => {} }, {
    secret: "test-secret",
    publicUrl: "http://localhost",
  });
  const app = Fastify();
  await app.register(fastifyCookie);
  registerAuthGuard(app, { service, allowAnonymous });
  await registerGameRoutes(app, { config: testConfig(vaultPath, allowAnonymous), credits: null });
  await app.ready();
  return { app, service, users };
}

async function cookieFor(t: TestApp, email: string, role: "user" | "admin" = "user"): Promise<string> {
  const passwordHash = await hashPassword("Abcd1234");
  t.users.create({ email, passwordHash, emailVerified: true, role });
  const { session } = await t.service.login(email, "Abcd1234");
  return session.id;
}

const COOKIE = (sid: string) => ({ adm_session: sid });

describe("provider settings gating (#58b)", () => {
  it("blocks a regular hosted user from editing global providers, but allows campaign", async () => {
    const t = await buildApp(await freshVault(), false);
    const user = await cookieFor(t, "tenant@example.com");

    // GET tells the client it may NOT edit providers.
    const view = await t.app.inject({ method: "GET", url: "/api/settings", cookies: COOKIE(user) });
    expect(view.statusCode).toBe(200);
    expect(view.json().canEditProviders).toBe(false);

    // A provider write is refused.
    const llm = await t.app.inject({
      method: "PUT",
      url: "/api/settings",
      cookies: COOKIE(user),
      payload: { llm: { model: "evil-model" } },
    });
    expect(llm.statusCode).toBe(403);

    // The per-user campaign selection still goes through.
    const camp = await t.app.inject({
      method: "PUT",
      url: "/api/settings",
      cookies: COOKIE(user),
      payload: { campaign: "demo" },
    });
    expect(camp.statusCode).toBe(200);

    await t.app.close();
  });

  it("lets a regular user pick their own model from the pool (#56g)", async () => {
    const t = await buildApp(await freshVault(), false);
    const user = await cookieFor(t, "tenant@example.com");

    // The pool (player-facing fields, no secrets) and an empty default choice.
    const view = await t.app.inject({ method: "GET", url: "/api/settings", cookies: COOKIE(user) });
    expect(view.json().selectedModel).toBe("");
    expect(view.json().modelPool.map((m: { model: string }) => m.model)).toEqual([
      "fast/slug",
      "smart/slug",
    ]);

    // Picking a pooled model persists for this user.
    const pick = await t.app.inject({
      method: "PUT",
      url: "/api/settings",
      cookies: COOKIE(user),
      payload: { selectedModel: "smart/slug" },
    });
    expect(pick.statusCode).toBe(200);
    expect(pick.json().selectedModel).toBe("smart/slug");

    // A slug that isn't in the pool is rejected → cleared to the default.
    const bogus = await t.app.inject({
      method: "PUT",
      url: "/api/settings",
      cookies: COOKIE(user),
      payload: { selectedModel: "evil/slug" },
    });
    expect(bogus.json().selectedModel).toBe("");

    await t.app.close();
  });

  it("lets an admin edit global providers in hosted mode", async () => {
    const t = await buildApp(await freshVault(), false);
    const admin = await cookieFor(t, "boss@example.com", "admin");

    const view = await t.app.inject({ method: "GET", url: "/api/settings", cookies: COOKIE(admin) });
    expect(view.json().canEditProviders).toBe(true);

    const res = await t.app.inject({
      method: "PUT",
      url: "/api/settings",
      cookies: COOKIE(admin),
      payload: { llm: { model: "mistral-medium-3.5" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().llm.model).toBe("mistral-medium-3.5");

    await t.app.close();
  });

  it("keeps provider editing open in self-hosted (anonymous) mode", async () => {
    const vault = await freshVault();
    await createCampaign(vault, { name: "Sdílená kampaň" });
    const t = await buildApp(vault, true);

    const view = await t.app.inject({ method: "GET", url: "/api/settings" });
    expect(view.json().canEditProviders).toBe(true);

    const res = await t.app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { llm: { model: "open-mistral-nemo" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().llm.model).toBe("open-mistral-nemo");

    await t.app.close();
  });
});
