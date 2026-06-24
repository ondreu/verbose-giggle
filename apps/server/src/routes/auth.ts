/**
 * Auth HTTP endpoints (#55b): registration, verification-email resend, and the
 * email-verification link target. Thin wrapper over {@link AuthService};
 * login/session (#55c) and reset (#55d) add their routes here later.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { AuthError, AuthService } from "../auth/service.js";
import type { User } from "../auth/users.js";

export interface AuthContext {
  service: AuthService;
  /** Send the cookie with the Secure flag (true behind HTTPS). */
  cookieSecure: boolean;
}

/** Name of the session cookie. */
export const SESSION_COOKIE = "adm_session";

/** Public view of a user (never expose the password hash). */
function userView(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    role: user.role,
  };
}

/** Minimal HTML page shown when a verification link is opened from an email. */
function resultPage(title: string, body: string): string {
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#16131c;color:#e8e2f0;
display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:28rem;padding:2rem;text-align:center;line-height:1.5}
a{color:#c9a86a}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p>
<p><a href="/">Pokračovat do aplikace</a></p></div></body></html>`;
}

export async function registerAuthRoutes(app: FastifyInstance, ctx: AuthContext): Promise<void> {
  function setSessionCookie(reply: FastifyReply, value: string, maxAgeMs: number): void {
    reply.setCookie(SESSION_COOKIE, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: ctx.cookieSecure,
      path: "/",
      maxAge: Math.floor(maxAgeMs / 1000),
    });
  }

  app.post<{ Body: { email?: string; password?: string } }>(
    "/api/auth/register",
    async (req, reply) => {
      const { email, password } = req.body ?? {};
      if (typeof email !== "string" || typeof password !== "string") {
        return reply.code(400).send({ error: "Chybí e-mail nebo heslo." });
      }
      try {
        const user = await ctx.service.register(email, password);
        return reply.code(201).send({ ok: true, userId: user.id, emailVerified: user.emailVerified });
      } catch (err) {
        if (err instanceof AuthError) return reply.code(err.statusCode).send({ error: err.message });
        throw err;
      }
    },
  );

  app.post<{ Body: { email?: string } }>("/api/auth/resend-verification", async (req, reply) => {
    const email = req.body?.email;
    if (typeof email === "string") await ctx.service.resendVerification(email);
    // Always neutral so the endpoint can't be used to probe for accounts.
    return reply.send({ ok: true });
  });

  app.get<{ Querystring: { token?: string } }>("/api/auth/verify", async (req, reply) => {
    const token = req.query?.token;
    if (typeof token !== "string" || !token) {
      return reply.code(400).type("text/html").send(resultPage("Ověření selhalo", "Chybí ověřovací token."));
    }
    try {
      ctx.service.verifyEmail(token);
      return reply
        .type("text/html")
        .send(resultPage("E-mail ověřen", "Tvůj účet je nyní ověřený. Můžeš se přihlásit."));
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).type("text/html").send(resultPage("Ověření selhalo", err.message));
      }
      throw err;
    }
  });

  app.post<{ Body: { email?: string; password?: string } }>(
    "/api/auth/login",
    async (req, reply) => {
      const { email, password } = req.body ?? {};
      if (typeof email !== "string" || typeof password !== "string") {
        return reply.code(400).send({ error: "Chybí e-mail nebo heslo." });
      }
      try {
        const { user, session } = await ctx.service.login(email, password);
        setSessionCookie(reply, session.id, ctx.service.sessionMaxAgeMs);
        return reply.send({ ok: true, user: userView(user) });
      } catch (err) {
        if (err instanceof AuthError) return reply.code(err.statusCode).send({ error: err.message });
        throw err;
      }
    },
  );

  app.post("/api/auth/logout", async (req, reply) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (sid) ctx.service.logout(sid);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/api/auth/me", async (req, reply) => {
    const user = ctx.service.currentUser(req.cookies?.[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: "Nepřihlášen." });
    return reply.send({ user: userView(user) });
  });
}
