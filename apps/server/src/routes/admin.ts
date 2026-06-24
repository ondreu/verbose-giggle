/**
 * Admin endpoints (#57). The route prefix `/api/admin` is gated to the admin
 * role by the auth guard (`auth/middleware.ts`), so handlers here can assume
 * the caller is an admin. This first slice is read-only (user list + overview);
 * mutating actions (role/verify/ban/credits) and the audit log land next.
 */
import type { FastifyInstance } from "fastify";
import type { UserStore } from "../auth/users.js";

export interface AdminContext {
  users: UserStore;
}

export async function registerAdminRoutes(app: FastifyInstance, ctx: AdminContext): Promise<void> {
  app.get("/api/admin/users", async () => ({
    users: ctx.users.list().map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      emailVerified: u.emailVerified,
      role: u.role,
      createdAt: u.createdAt,
    })),
  }));

  app.get("/api/admin/overview", async () => {
    const all = ctx.users.list();
    return {
      users: all.length,
      admins: all.filter((u) => u.role === "admin").length,
      unverified: all.filter((u) => !u.emailVerified).length,
    };
  });
}
