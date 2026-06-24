/**
 * Admin endpoints (#57). The route prefix `/api/admin` is gated to the admin
 * role by the auth guard (`auth/middleware.ts`), so handlers here can assume
 * the caller is an admin (`req.user` is a non-null admin). Mutating actions are
 * recorded to the append-only audit log (#57c). Safety rails prevent an admin
 * from locking themselves out (no self-demote / self-delete).
 */
import type { FastifyInstance } from "fastify";
import type { UserRole, UserStore } from "../auth/users.js";
import type { SessionStore } from "../auth/sessions.js";
import type { AuditStore } from "../auth/audit.js";

export interface AdminContext {
  users: UserStore;
  sessions: SessionStore;
  audit: AuditStore;
}

function userRow(u: ReturnType<UserStore["list"]>[number]) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    emailVerified: u.emailVerified,
    role: u.role,
    createdAt: u.createdAt,
  };
}

export async function registerAdminRoutes(app: FastifyInstance, ctx: AdminContext): Promise<void> {
  app.get("/api/admin/users", async () => ({ users: ctx.users.list().map(userRow) }));

  app.get("/api/admin/overview", async () => {
    const all = ctx.users.list();
    return {
      users: all.length,
      admins: all.filter((u) => u.role === "admin").length,
      unverified: all.filter((u) => !u.emailVerified).length,
    };
  });

  app.get("/api/admin/audit", async () => ({ entries: ctx.audit.list() }));

  // Change a user's role. Refuses to demote the last/own admin away.
  app.put<{ Params: { id: string }; Body: { role?: string } }>(
    "/api/admin/users/:id/role",
    async (req, reply) => {
      const role = req.body?.role;
      if (role !== "admin" && role !== "user") {
        return reply.code(400).send({ error: "Neplatná role." });
      }
      const target = ctx.users.findById(req.params.id);
      if (!target) return reply.code(404).send({ error: "Uživatel nenalezen." });
      if (target.id === req.user!.id && role !== "admin") {
        return reply.code(400).send({ error: "Nelze odebrat vlastní admin roli." });
      }
      ctx.users.setRole(target.id, role as UserRole);
      ctx.audit.record(req.user!.id, "user.role", target.id, `${target.role} → ${role}`);
      return reply.send({ user: userRow(ctx.users.findById(target.id)!) });
    },
  );

  // Manually verify / unverify a user's email.
  app.put<{ Params: { id: string }; Body: { verified?: boolean } }>(
    "/api/admin/users/:id/verify",
    async (req, reply) => {
      const verified = Boolean(req.body?.verified);
      const target = ctx.users.findById(req.params.id);
      if (!target) return reply.code(404).send({ error: "Uživatel nenalezen." });
      ctx.users.setEmailVerified(target.id, verified);
      ctx.audit.record(req.user!.id, "user.verify", target.id, String(verified));
      return reply.send({ user: userRow(ctx.users.findById(target.id)!) });
    },
  );

  // Delete a user (ban). Drops their sessions first. No self-delete.
  app.delete<{ Params: { id: string } }>("/api/admin/users/:id", async (req, reply) => {
    const target = ctx.users.findById(req.params.id);
    if (!target) return reply.code(404).send({ error: "Uživatel nenalezen." });
    if (target.id === req.user!.id) {
      return reply.code(400).send({ error: "Nelze smazat vlastní účet z admin panelu." });
    }
    ctx.sessions.deleteForUser(target.id);
    ctx.users.delete(target.id);
    ctx.audit.record(req.user!.id, "user.delete", target.id, target.email);
    return reply.send({ ok: true });
  });
}
