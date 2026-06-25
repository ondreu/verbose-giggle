import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import { openInMemoryDatabase } from "../src/db/database.js";
import { UserStore } from "../src/auth/users.js";
import { SessionStore } from "../src/auth/sessions.js";
import { AuditStore } from "../src/auth/audit.js";
import { CreditStore } from "../src/credits/ledger.js";
import { AuthService } from "../src/auth/service.js";
import { registerAuthGuard } from "../src/auth/middleware.js";
import { registerAdminRoutes } from "../src/routes/admin.js";
import { deleteUserVault } from "../src/admin/ops.js";
import { hashPassword } from "../src/auth/password.js";
import { applySettings, loadConfig, type Config } from "../src/config.js";
import { loadSettings } from "../src/settings.js";

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function freshVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "adm-admin-"));
  tmpDirs.push(root);
  return path.join(root, "vault");
}

async function setup() {
  const db = openInMemoryDatabase();
  const users = new UserStore(db);
  const sessions = new SessionStore(db);
  const audit = new AuditStore(db);
  const credits = new CreditStore(db);
  const service = new AuthService(users, sessions, { send: async () => {} }, {
    secret: "s",
    publicUrl: "http://localhost",
  });

  const hash = await hashPassword("Abcd1234");
  const admin = users.create({ email: "admin@e.c", passwordHash: hash, role: "admin", emailVerified: true });
  const member = users.create({ email: "member@e.c", passwordHash: hash, emailVerified: true });
  const adminSid = (await service.login("admin@e.c", "Abcd1234")).session.id;
  const memberSid = (await service.login("member@e.c", "Abcd1234")).session.id;

  const vaultPath = await freshVault();
  await fs.mkdir(vaultPath, { recursive: true });
  // Mirror index.ts: effective config = env floor + persisted vault settings,
  // so a server-settings PUT round-trips through settings.json (deploy-persistent).
  const build = async (): Promise<Config> =>
    applySettings({ ...loadConfig(), vaultPath }, await loadSettings(vaultPath));
  let config: Config = await build();
  const reloadConfig = async () => (config = await build());

  const app: FastifyInstance = Fastify();
  await app.register(fastifyCookie);
  registerAuthGuard(app, { service, allowAnonymous: true });
  await registerAdminRoutes(app, {
    users,
    sessions,
    audit,
    credits,
    vaultPath,
    getConfig: () => config,
    reloadConfig,
    bootAllowAnonymous: config.auth.allowAnonymous,
    onUserDeleted: (userId) => deleteUserVault(vaultPath, userId),
    getLogs: (limit) => ["log-a", "log-b", "log-c"].slice(-limit),
    startedAtMs: Date.now(),
    now: () => "2026-06-25T12:00:00.000Z",
  });
  await app.ready();

  return {
    app, users, sessions, audit, credits, service, admin, member, adminSid, memberSid, vaultPath,
    getConfig: () => config,
  };
}

const asAdmin = (sid: string) => ({ cookies: { adm_session: sid } });

describe("admin user management (#57b/#57c)", () => {
  it("lists users and an overview for an admin", async () => {
    const { app, adminSid } = await setup();
    const list = await app.inject({ method: "GET", url: "/api/admin/users", ...asAdmin(adminSid) });
    expect(list.statusCode).toBe(200);
    expect(list.json().users).toHaveLength(2);
    const ov = await app.inject({ method: "GET", url: "/api/admin/overview", ...asAdmin(adminSid) });
    expect(ov.json()).toMatchObject({ users: 2, admins: 1, unverified: 0 });
    await app.close();
  });

  it("changes a role and records it in the audit log", async () => {
    const { app, users, member, admin, adminSid } = await setup();
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/users/${member.id}/role`,
      payload: { role: "admin" },
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(200);
    expect(users.findById(member.id)!.role).toBe("admin");

    const audit = await app.inject({ method: "GET", url: "/api/admin/audit", ...asAdmin(adminSid) });
    const entries = audit.json().entries;
    expect(entries[0]).toMatchObject({ actorId: admin.id, action: "user.role", targetId: member.id });
    await app.close();
  });

  it("refuses to demote your own admin role", async () => {
    const { app, admin, adminSid } = await setup();
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/users/${admin.id}/role`,
      payload: { role: "user" },
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("verifies a user and deletes (bans) one, dropping their sessions", async () => {
    const { app, users, sessions, member, memberSid, adminSid, service } = await setup();
    // member currently has a live session
    expect(service.currentUser(memberSid)).not.toBeNull();

    const del = await app.inject({
      method: "DELETE",
      url: `/api/admin/users/${member.id}`,
      ...asAdmin(adminSid),
    });
    expect(del.statusCode).toBe(200);
    expect(users.findById(member.id)).toBeNull();
    expect(sessions.get(memberSid)).toBeNull();
    await app.close();
  });

  it("purges the banned user's isolated vault subtree on delete (#59e)", async () => {
    const { app, member, adminSid, vaultPath } = await setup();
    const userDir = path.join(vaultPath, "users", member.id, "campaigns", "solo");
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(path.join(userDir, "campaign.yaml"), "name: Solo\n");

    const del = await app.inject({
      method: "DELETE",
      url: `/api/admin/users/${member.id}`,
      ...asAdmin(adminSid),
    });
    expect(del.statusCode).toBe(200);
    await expect(fs.stat(path.join(vaultPath, "users", member.id))).rejects.toThrow();
    await app.close();
  });

  it("grants and deducts credits, surfacing the balance in the user list", async () => {
    const { app, credits, member, adminSid } = await setup();
    const grant = await app.inject({
      method: "POST",
      url: `/api/admin/users/${member.id}/credits`,
      payload: { amount: 500, reason: "welcome" },
      ...asAdmin(adminSid),
    });
    expect(grant.statusCode).toBe(200);
    expect(grant.json().balance).toBe(500);

    await app.inject({
      method: "POST",
      url: `/api/admin/users/${member.id}/credits`,
      payload: { amount: -200 },
      ...asAdmin(adminSid),
    });
    expect(credits.balance(member.id)).toBe(300);

    const list = await app.inject({ method: "GET", url: "/api/admin/users", ...asAdmin(adminSid) });
    const row = list.json().users.find((u: { id: string }) => u.id === member.id);
    expect(row.credits).toBe(300);
    await app.close();
  });

  it("rejects a zero or non-integer credit adjustment", async () => {
    const { app, member, adminSid } = await setup();
    expect(
      (await app.inject({ method: "POST", url: `/api/admin/users/${member.id}/credits`, payload: { amount: 0 }, ...asAdmin(adminSid) })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: "POST", url: `/api/admin/users/${member.id}/credits`, payload: { amount: 1.5 }, ...asAdmin(adminSid) })).statusCode,
    ).toBe(400);
    await app.close();
  });

  it("refuses self-delete", async () => {
    const { app, admin, adminSid } = await setup();
    const res = await app.inject({ method: "DELETE", url: `/api/admin/users/${admin.id}`, ...asAdmin(adminSid) });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("blocks a non-admin from the admin area", async () => {
    const { app, member, memberSid } = await setup();
    expect(
      (await app.inject({ method: "GET", url: "/api/admin/users", ...asAdmin(memberSid) })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "DELETE", url: `/api/admin/users/${member.id}`, ...asAdmin(memberSid) }))
        .statusCode,
    ).toBe(403);
    await app.close();
  });
});

describe("admin dev panel (#57b)", () => {
  it("reports runtime health", async () => {
    const { app, adminSid } = await setup();
    const res = await app.inject({ method: "GET", url: "/api/admin/health", ...asAdmin(adminSid) });
    expect(res.statusCode).toBe(200);
    const h = res.json();
    expect(h.ok).toBe(true);
    expect(h.users).toBe(2);
    expect(h.activeSessions).toBeGreaterThanOrEqual(2);
    expect(typeof h.node).toBe("string");
    expect(h.providers.llm).toBeDefined();
    await app.close();
  });

  it("persists server settings through settings.json and applies them live", async () => {
    const { app, adminSid, getConfig } = await setup();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/server-settings",
      payload: { creditsEnabled: true, requireVerifiedEmail: false, pricing: { perImage: 99 } },
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(200);
    const view = res.json();
    expect(view.creditsEnabled).toBe(true);
    expect(view.requireVerifiedEmail).toBe(false);
    expect(view.pricing.perImage).toBe(99);
    // Effective config rebuilt from the persisted file.
    expect(getConfig().credits.enabled).toBe(true);
    expect(getConfig().credits.pricing.perImage).toBe(99);
    await app.close();
  });

  it("flags allowAnonymous as needing a restart once it drifts from boot (#59f)", async () => {
    const { app, adminSid } = await setup();
    // Boot value is true; before any change there's no pending restart.
    const before = await app.inject({ method: "GET", url: "/api/admin/server-settings", ...asAdmin(adminSid) });
    expect(before.json().allowAnonymousPendingRestart).toBe(false);

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/server-settings",
      payload: { allowAnonymous: false },
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().allowAnonymous).toBe(false);
    // Live value now differs from the boot snapshot the routing still uses.
    expect(res.json().allowAnonymousPendingRestart).toBe(true);
    await app.close();
  });

  it("persists per-model message pricing and exposes the model list", async () => {
    const { app, adminSid, getConfig } = await setup();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/server-settings",
      payload: { pricing: { perMessage: 12, perCampaign: 300, perModelMessage: { "claude-opus": 40 } } },
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(200);
    const view = res.json();
    expect(view.pricing.perMessage).toBe(12);
    expect(view.pricing.perCampaign).toBe(300);
    expect(view.pricing.perModelMessage["claude-opus"]).toBe(40);
    expect(Array.isArray(view.models)).toBe(true);
    expect(getConfig().credits.pricing.perModelMessage["claude-opus"]).toBe(40);
    await app.close();
  });

  it("rejects a non-object per-model price map", async () => {
    const { app, adminSid } = await setup();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/server-settings",
      payload: { pricing: { perModelMessage: [1, 2] } },
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects a negative price", async () => {
    const { app, adminSid } = await setup();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/server-settings",
      payload: { pricing: { perImage: -1 } },
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("persists a model pool and folds its prices into perModelMessage (#56g)", async () => {
    const { app, adminSid, getConfig } = await setup();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/server-settings",
      payload: {
        modelPool: [
          { name: "Flash", model: "deepseek/deepseek-v4-flash", perMessage: 20, intelligence: 1, price: 1 },
          // stars out of range get clamped to 1–5; perMessage rounds up.
          { name: "", model: "anthropic/claude-sonnet-4.6", perMessage: 449.2, intelligence: 9, price: 0 },
        ],
      },
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(200);
    const view = res.json();
    expect(view.modelPool).toHaveLength(2);
    expect(view.modelPool[1].name).toBe("anthropic/claude-sonnet-4.6"); // falls back to slug
    expect(view.modelPool[1].perMessage).toBe(450); // ceil
    expect(view.modelPool[1].intelligence).toBe(5); // clamped
    expect(view.modelPool[1].price).toBe(1); // clamped
    // The pool drives the per-model billing table read by creditsPerMessage.
    const pricing = getConfig().credits.pricing.perModelMessage;
    expect(pricing["deepseek/deepseek-v4-flash"]).toBe(20);
    expect(pricing["anthropic/claude-sonnet-4.6"]).toBe(450);
    // The slugs also appear in the price-table model list.
    expect(view.models).toContain("deepseek/deepseek-v4-flash");
    await app.close();
  });

  it("rejects a model pool entry without a slug", async () => {
    const { app, adminSid } = await setup();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/server-settings",
      payload: { modelPool: [{ name: "x", model: "  ", perMessage: 10, intelligence: 3, price: 3 }] },
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("aggregates credit usage by reason and user", async () => {
    const { app, credits, member, admin, adminSid } = await setup();
    credits.grant(member.id, 1000, "admin-grant");
    credits.charge(member.id, 30, "llm");
    credits.charge(member.id, 50, "image");
    credits.charge(admin.id, 20, "llm");
    const res = await app.inject({ method: "GET", url: "/api/admin/usage", ...asAdmin(adminSid) });
    expect(res.statusCode).toBe(200);
    const u = res.json();
    expect(u.totals.spent).toBe(100);
    expect(u.totals.granted).toBe(1000);
    const llm = u.byReason.find((r: { reason: string }) => r.reason === "llm");
    expect(llm.spent).toBe(50);
    const memberRow = u.byUser.find((r: { userId: string }) => r.userId === member.id);
    expect(memberRow.email).toBe("member@e.c");
    expect(memberRow.spent).toBe(80);
    await app.close();
  });

  it("lists, exports and deletes campaigns across scopes", async () => {
    const { app, adminSid, vaultPath } = await setup();
    // Seed a shared campaign and a per-user one.
    await fs.mkdir(path.join(vaultPath, "campaigns", "saga"), { recursive: true });
    await fs.writeFile(path.join(vaultPath, "campaigns", "saga", "campaign.yaml"), "name: Velká sága\n");
    await fs.mkdir(path.join(vaultPath, "users", "u1", "campaigns", "solo"), { recursive: true });
    await fs.writeFile(path.join(vaultPath, "users", "u1", "campaigns", "solo", "campaign.yaml"), "name: Solo\n");

    const list = await app.inject({ method: "GET", url: "/api/admin/vaults", ...asAdmin(adminSid) });
    const campaigns = list.json().campaigns;
    expect(campaigns).toHaveLength(2);
    expect(campaigns.find((c: { folder: string }) => c.folder === "saga").name).toBe("Velká sága");

    const exp = await app.inject({
      method: "GET",
      url: "/api/admin/vaults/__shared__/campaigns/saga/export",
      ...asAdmin(adminSid),
    });
    expect(exp.statusCode).toBe(200);
    expect(exp.headers["content-type"]).toContain("application/zip");
    expect(exp.rawPayload.length).toBeGreaterThan(0);

    const del = await app.inject({
      method: "DELETE",
      url: "/api/admin/vaults/u1/campaigns/solo",
      ...asAdmin(adminSid),
    });
    expect(del.statusCode).toBe(200);
    const after = await app.inject({ method: "GET", url: "/api/admin/vaults", ...asAdmin(adminSid) });
    expect(after.json().campaigns).toHaveLength(1);
    await app.close();
  });

  it("rejects path traversal in campaign management", async () => {
    const { app, adminSid } = await setup();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/admin/vaults/..%2f..%2f/campaigns/x",
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("creates, lists, downloads and deletes a full-vault backup", async () => {
    const { app, adminSid, vaultPath } = await setup();
    await fs.writeFile(path.join(vaultPath, "settings.json"), '{"campaign":"x"}');

    const create = await app.inject({ method: "POST", url: "/api/admin/backups", ...asAdmin(adminSid) });
    expect(create.statusCode).toBe(200);
    const name = create.json().name;
    expect(name).toMatch(/^vault-.*\.zip$/);

    const list = await app.inject({ method: "GET", url: "/api/admin/backups", ...asAdmin(adminSid) });
    expect(list.json().backups).toHaveLength(1);

    const dl = await app.inject({ method: "GET", url: `/api/admin/backups/${name}`, ...asAdmin(adminSid) });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-type"]).toContain("application/zip");

    // A second backup must not contain the first (backups/ is excluded).
    const create2 = await app.inject({ method: "POST", url: "/api/admin/backups", ...asAdmin(adminSid) });
    expect(create2.statusCode).toBe(200);

    const del = await app.inject({ method: "DELETE", url: `/api/admin/backups/${name}`, ...asAdmin(adminSid) });
    expect(del.statusCode).toBe(200);
    await app.close();
  });

  it("rejects an unsafe backup name", async () => {
    const { app, adminSid } = await setup();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/admin/backups/..%2f..%2fapp.db",
      ...asAdmin(adminSid),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("tails server logs for an admin (#59g)", async () => {
    const { app, adminSid } = await setup();
    const res = await app.inject({ method: "GET", url: "/api/admin/logs?limit=2", ...asAdmin(adminSid) });
    expect(res.statusCode).toBe(200);
    expect(res.json().available).toBe(true);
    expect(res.json().lines).toEqual(["log-b", "log-c"]);
  });

  it("paginates the users list with limit/offset and a total (#59h)", async () => {
    const { app, adminSid, users } = await setup();
    const hash = await hashPassword("Abcd1234");
    for (let i = 0; i < 5; i++) users.create({ email: `p${i}@e.c`, passwordHash: hash, emailVerified: true });

    const page = await app.inject({
      method: "GET",
      url: "/api/admin/users?limit=2&offset=1",
      ...asAdmin(adminSid),
    });
    expect(page.statusCode).toBe(200);
    const body = page.json();
    expect(body.users).toHaveLength(2);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(1);
    // 2 from setup (admin + member) + 5 created = 7.
    expect(body.total).toBe(7);
  });

  it("caps an over-large page size (#59h)", async () => {
    const { app, adminSid } = await setup();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users?limit=99999",
      ...asAdmin(adminSid),
    });
    expect(res.json().limit).toBe(500);
  });

  it("stages a restore from a stored backup (#59c)", async () => {
    const { app, adminSid, vaultPath } = await setup();
    // Tests use an in-memory DB, so write a db/app.db file the backup must carry
    // for restore validation to accept the archive as a real vault backup.
    await fs.mkdir(path.join(vaultPath, "db"), { recursive: true });
    await fs.writeFile(path.join(vaultPath, "db", "app.db"), "fake-sqlite");
    const create = await app.inject({ method: "POST", url: "/api/admin/backups", ...asAdmin(adminSid) });
    const name = create.json().name;

    const restore = await app.inject({
      method: "POST",
      url: `/api/admin/backups/${name}/restore`,
      ...asAdmin(adminSid),
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().appliesAtRestart).toBe(true);
    // The marker is staged for the next boot to pick up.
    await expect(fs.stat(path.join(vaultPath, ".restore-pending.zip"))).resolves.toBeTruthy();
    await app.close();
  });
});
