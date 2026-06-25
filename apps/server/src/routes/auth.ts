/**
 * Auth HTTP endpoints (#55b): registration, verification-email resend, and the
 * email-verification link target. Thin wrapper over {@link AuthService};
 * login/session (#55c) and reset (#55d) add their routes here later.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { AuthError, AuthService } from "../auth/service.js";
import type { User } from "../auth/users.js";

export interface AuthFlags {
  allowAnonymous: boolean;
  registrationEnabled: boolean;
  creditsEnabled: boolean;
}

export interface AuthContext {
  service: AuthService;
  /** Send the cookie with the Secure flag (true behind HTTPS). */
  cookieSecure: boolean;
  /**
   * Public auth flags surfaced to the client (#55e, #56e). A getter so a live
   * config change from the admin panel (#57b) is reflected without restart.
   */
  flags: AuthFlags | (() => AuthFlags);
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

/** Self-contained "set a new password" form, target of the reset email link. */
function resetFormPage(token: string): string {
  // token is base64url + '.', safe inside a JSON-encoded JS string literal.
  const tokenJson = JSON.stringify(token);
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Obnovení hesla</title>
<style>body{font-family:system-ui,sans-serif;background:#16131c;color:#e8e2f0;
display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:24rem;width:90%;padding:2rem;line-height:1.5}
input,button{font:inherit;width:100%;box-sizing:border-box;padding:.6rem;margin:.3rem 0;
border-radius:.4rem;border:1px solid #443c52;background:#211c2b;color:inherit}
button{background:#c9a86a;color:#16131c;border:0;cursor:pointer}
.msg{min-height:1.4rem}.err{color:#e89}.ok{color:#8e8}</style></head>
<body><div class="card"><h1>Nové heslo</h1>
<form id="f"><input id="p" type="password" placeholder="Nové heslo" autocomplete="new-password" required>
<button type="submit">Nastavit heslo</button></form>
<p class="msg" id="m"></p></div>
<script>
const token=${tokenJson};
const f=document.getElementById('f'),p=document.getElementById('p'),m=document.getElementById('m');
f.addEventListener('submit',async(e)=>{
  e.preventDefault();m.textContent='';m.className='msg';
  const res=await fetch('/api/auth/reset',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({token,password:p.value})});
  const data=await res.json().catch(()=>({}));
  if(res.ok){m.textContent='Heslo bylo změněno. Můžeš se přihlásit.';m.className='msg ok';f.style.display='none';}
  else{m.textContent=data.error||'Obnovení selhalo.';m.className='msg err';}
});
</script></body></html>`;
}

export async function registerAuthRoutes(app: FastifyInstance, ctx: AuthContext): Promise<void> {
  const getFlags = (): AuthFlags => (typeof ctx.flags === "function" ? ctx.flags() : ctx.flags);

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
      if (!getFlags().registrationEnabled) {
        return reply.code(403).send({ error: "Registrace je vypnutá." });
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

  // Public flags so the login screen can adapt (anonymous access, registration).
  app.get("/api/auth/config", async () => ({ ...getFlags() }));

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

  app.post<{ Body: { email?: string } }>("/api/auth/forgot", async (req, reply) => {
    const email = req.body?.email;
    if (typeof email === "string") await ctx.service.requestPasswordReset(email);
    // Always neutral so the endpoint can't probe for accounts.
    return reply.send({ ok: true });
  });

  app.post<{ Body: { token?: string; password?: string } }>(
    "/api/auth/reset",
    async (req, reply) => {
      const { token, password } = req.body ?? {};
      if (typeof token !== "string" || typeof password !== "string") {
        return reply.code(400).send({ error: "Chybí token nebo heslo." });
      }
      try {
        await ctx.service.resetPassword(token, password);
        return reply.send({ ok: true });
      } catch (err) {
        if (err instanceof AuthError) return reply.code(err.statusCode).send({ error: err.message });
        throw err;
      }
    },
  );

  // Target of the emailed reset link: a minimal self-contained form that POSTs
  // back to /api/auth/reset, so reset works before the front-end (#55e) lands.
  app.get<{ Querystring: { token?: string } }>("/api/auth/reset", async (req, reply) => {
    const token = req.query?.token;
    if (typeof token !== "string" || !token) {
      return reply.code(400).type("text/html").send(resultPage("Obnovení hesla", "Chybí token."));
    }
    return reply.type("text/html").send(resetFormPage(token));
  });

  // --- Account settings (#58a), all require the current session -------------
  app.put<{ Body: { displayName?: string | null } }>("/api/account/profile", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "Nepřihlášen." });
    const dn = req.body?.displayName;
    const user = ctx.service.changeDisplayName(req.user.id, typeof dn === "string" ? dn : null);
    return reply.send({ user: userView(user) });
  });

  app.put<{ Body: { email?: string } }>("/api/account/email", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "Nepřihlášen." });
    if (typeof req.body?.email !== "string") return reply.code(400).send({ error: "Chybí e-mail." });
    try {
      const user = await ctx.service.changeEmail(req.user.id, req.body.email);
      return reply.send({ user: userView(user) });
    } catch (err) {
      if (err instanceof AuthError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put<{ Body: { currentPassword?: string; newPassword?: string } }>(
    "/api/account/password",
    async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "Nepřihlášen." });
      const { currentPassword, newPassword } = req.body ?? {};
      if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
        return reply.code(400).send({ error: "Chybí heslo." });
      }
      try {
        await ctx.service.changePassword(req.user.id, currentPassword, newPassword);
        // changePassword dropped all sessions; re-issue one for this device.
        const session = ctx.service.openSession(req.user.id);
        setSessionCookie(reply, session.id, ctx.service.sessionMaxAgeMs);
        return reply.send({ ok: true });
      } catch (err) {
        if (err instanceof AuthError) return reply.code(err.statusCode).send({ error: err.message });
        throw err;
      }
    },
  );

  app.delete("/api/account", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "Nepřihlášen." });
    ctx.service.deleteAccount(req.user.id);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.send({ ok: true });
  });
}
