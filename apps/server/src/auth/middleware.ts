/**
 * Request authentication + route gating (#55f, part 1).
 *
 * Resolves the session user (from the httpOnly cookie) onto every request as
 * `req.user`, and — when anonymous access is disabled (hosted edition) —
 * refuses protected API routes without a valid session. This is the
 * authentication layer; per-user *data* isolation (a vault + SessionManager per
 * user) is the separate, larger part of #55f.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthService } from "./service.js";
import type { User } from "./users.js";
import { SESSION_COOKIE } from "../routes/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The signed-in user for this request, or null if anonymous. */
    user: User | null;
  }
}

/** API paths reachable without a session even when anonymous access is off. */
function isPublicPath(url: string): boolean {
  // Strip query string for matching.
  const path = url.split("?", 1)[0]!;
  if (!path.startsWith("/api/")) return true; // static assets, SPA shell
  return (
    path.startsWith("/api/auth/") || // login/register/verify/reset/config
    path === "/api/health"
  );
}

export interface AuthGuardOptions {
  service: AuthService;
  /**
   * When false, protected /api routes require a session (hosted edition).
   * Accepts a getter so a live config change (admin panel, #57b) is honoured
   * per request without re-registering the hook.
   */
  allowAnonymous: boolean | (() => boolean);
}

/**
 * Register the auth hook. Must run after `@fastify/cookie` is registered so
 * `req.cookies` is populated. Decorates `req.user` and enforces the gate.
 */
export function registerAuthGuard(app: FastifyInstance, opts: AuthGuardOptions): void {
  app.decorateRequest("user", null);
  const allowAnonymous =
    typeof opts.allowAnonymous === "function" ? opts.allowAnonymous : () => opts.allowAnonymous as boolean;

  app.addHook("onRequest", async (req: FastifyRequest, reply) => {
    req.user = opts.service.currentUser(req.cookies?.[SESSION_COOKIE]);

    const path = req.url.split("?", 1)[0]!;
    // Admin area (#57): always requires the admin role, regardless of the
    // anonymous-access setting.
    if (path.startsWith("/api/admin")) {
      if (!req.user) return reply.code(401).send({ error: "Vyžadováno přihlášení." });
      if (req.user.role !== "admin") return reply.code(403).send({ error: "Přístup jen pro administrátory." });
      return;
    }
    if (!allowAnonymous() && !req.user && !isPublicPath(req.url)) {
      return reply.code(401).send({ error: "Vyžadováno přihlášení." });
    }
  });
}
