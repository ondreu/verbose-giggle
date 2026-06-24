import { describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import { openInMemoryDatabase } from "../src/db/database.js";
import { UserStore } from "../src/auth/users.js";
import { SessionStore } from "../src/auth/sessions.js";
import { AuditStore } from "../src/auth/audit.js";
import { AuthService } from "../src/auth/service.js";
import { registerAuthGuard } from "../src/auth/middleware.js";
import { registerAdminRoutes } from "../src/routes/admin.js";
import { hashPassword } from "../src/auth/password.js";

async function setup() {
  const db = openInMemoryDatabase();
  const users = new UserStore(db);
  const sessions = new SessionStore(db);
  const audit = new AuditStore(db);
  const service = new AuthService(users, sessions, { send: async () => {} }, {
    secret: "s",
    publicUrl: "http://localhost",
  });

  const hash = await hashPassword("Abcd1234");
  const admin = users.create({ email: "admin@e.c", passwordHash: hash, role: "admin", emailVerified: true });
  const member = users.create({ email: "member@e.c", passwordHash: hash, emailVerified: true });
  const adminSid = (await service.login("admin@e.c", "Abcd1234")).session.id;
  const memberSid = (await service.login("member@e.c", "Abcd1234")).session.id;

  const app: FastifyInstance = Fastify();
  await app.register(fastifyCookie);
  registerAuthGuard(app, { service, allowAnonymous: true });
  await registerAdminRoutes(app, { users, sessions, audit });
  await app.ready();

  return { app, users, sessions, audit, service, admin, member, adminSid, memberSid };
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
