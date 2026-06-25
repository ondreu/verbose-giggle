import { describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import { openInMemoryDatabase } from "../src/db/database.js";
import { UserStore } from "../src/auth/users.js";
import { SessionStore } from "../src/auth/sessions.js";
import { AuthService } from "../src/auth/service.js";
import { registerAuthGuard } from "../src/auth/middleware.js";
import { hashPassword } from "../src/auth/password.js";

async function buildApp(allowAnonymous: boolean): Promise<{ app: FastifyInstance; service: AuthService }> {
  const db = openInMemoryDatabase();
  const users = new UserStore(db);
  const sessions = new SessionStore(db);
  const service = new AuthService(users, sessions, { send: async () => {} }, {
    secret: "s",
    publicUrl: "http://localhost",
  });

  const app = Fastify();
  await app.register(fastifyCookie);
  registerAuthGuard(app, { service, allowAnonymous });
  app.get("/api/state", async (req) => ({ ok: true, user: req.user?.email ?? null }));
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/auth/config", async () => ({ allowAnonymous }));
  app.get("/", async () => "index");
  await app.ready();
  return { app, service };
}

async function makeSession(service: AuthService, users: UserStore): Promise<string> {
  const hash = await hashPassword("Abcd1234");
  users.create({ email: "hero@example.com", passwordHash: hash, emailVerified: true });
  const { session } = await service.login("hero@example.com", "Abcd1234");
  return session.id;
}

describe("auth guard (#55f)", () => {
  it("allows protected routes for anonymous when allowAnonymous=true", async () => {
    const { app } = await buildApp(true);
    const res = await app.inject({ method: "GET", url: "/api/state" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, user: null });
    await app.close();
  });

  it("blocks protected routes for anonymous when allowAnonymous=false", async () => {
    const { app } = await buildApp(false);
    const res = await app.inject({ method: "GET", url: "/api/state" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("always allows auth, health and non-api paths", async () => {
    const { app } = await buildApp(false);
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/auth/config" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/" })).statusCode).toBe(200);
    await app.close();
  });

  it("gates /api/admin to the admin role", async () => {
    const db = openInMemoryDatabase();
    const users = new UserStore(db);
    const sessions = new SessionStore(db);
    const service = new AuthService(users, sessions, { send: async () => {} }, {
      secret: "s",
      publicUrl: "http://localhost",
    });
    const app = Fastify();
    await app.register(fastifyCookie);
    registerAuthGuard(app, { service, allowAnonymous: true });
    app.get("/api/admin/users", async () => ({ ok: true }));
    await app.ready();

    // Anonymous → 401.
    expect((await app.inject({ method: "GET", url: "/api/admin/users" })).statusCode).toBe(401);

    // Plain user → 403.
    const hash = await hashPassword("Abcd1234");
    const u = users.create({ email: "u@e.c", passwordHash: hash, emailVerified: true });
    const userSid = (await service.login("u@e.c", "Abcd1234")).session.id;
    expect(
      (await app.inject({ method: "GET", url: "/api/admin/users", cookies: { adm_session: userSid } }))
        .statusCode,
    ).toBe(403);

    // Admin → 200.
    users.setRole(u.id, "admin");
    const adminSid = (await service.login("u@e.c", "Abcd1234")).session.id;
    expect(
      (await app.inject({ method: "GET", url: "/api/admin/users", cookies: { adm_session: adminSid } }))
        .statusCode,
    ).toBe(200);
    await app.close();
  });

  it("populates req.user and permits the route with a valid session cookie", async () => {
    // Build with our own store so we can mint a session against the same DB.
    const db = openInMemoryDatabase();
    const users = new UserStore(db);
    const sessions = new SessionStore(db);
    const service = new AuthService(users, sessions, { send: async () => {} }, {
      secret: "s",
      publicUrl: "http://localhost",
    });
    const app = Fastify();
    await app.register(fastifyCookie);
    registerAuthGuard(app, { service, allowAnonymous: false });
    app.get("/api/state", async (req) => ({ user: req.user?.email ?? null }));
    await app.ready();

    const sid = await makeSession(service, users);
    const res = await app.inject({
      method: "GET",
      url: "/api/state",
      cookies: { adm_session: sid },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: "hero@example.com" });
    await app.close();
  });
});
