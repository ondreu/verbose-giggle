import { describe, expect, it } from "vitest";
import { openInMemoryDatabase } from "../src/db/database.js";
import { UserStore } from "../src/auth/users.js";
import { SessionStore } from "../src/auth/sessions.js";
import { AuthError, AuthService } from "../src/auth/service.js";
import { createToken, loadOrCreateSecret, verifyToken } from "../src/auth/tokens.js";
import { validateEmail, validatePassword } from "../src/auth/validation.js";
import type { EmailMessage, EmailSender } from "../src/auth/email.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

class FakeEmailSender implements EmailSender {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
  /** Pull the token out of the most recent email's link. */
  lastToken(): string {
    const text = this.sent.at(-1)?.text ?? "";
    return /token=([^\s&]+)/.exec(text)?.[1] ?? "";
  }
}

function freshService(
  email = new FakeEmailSender(),
  opts: { requireVerifiedEmail?: boolean } = {},
) {
  const db = openInMemoryDatabase();
  const users = new UserStore(db);
  const sessions = new SessionStore(db);
  const service = new AuthService(users, sessions, email, {
    secret: "test-secret",
    publicUrl: "https://dm.example",
    requireVerifiedEmail: opts.requireVerifiedEmail ?? true,
  });
  return { users, sessions, service, email };
}

describe("signed tokens", () => {
  it("round-trips for the matching purpose", () => {
    const t = createToken("user-1", "verify-email", "s", 60_000);
    const r = verifyToken(t, "verify-email", "s");
    expect(r).toEqual({ ok: true, userId: "user-1" });
  });

  it("rejects wrong purpose, bad secret, tampering and expiry", () => {
    const t = createToken("user-1", "verify-email", "s", 60_000);
    expect(verifyToken(t, "reset-password", "s")).toEqual({ ok: false, reason: "wrong-purpose" });
    expect(verifyToken(t, "verify-email", "other")).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyToken(t + "x", "verify-email", "s").ok).toBe(false);
    expect(verifyToken("garbage", "verify-email", "s")).toEqual({ ok: false, reason: "malformed" });
    const expired = createToken("user-1", "verify-email", "s", -1);
    expect(verifyToken(expired, "verify-email", "s")).toEqual({ ok: false, reason: "expired" });
  });

  it("persists and reuses a generated secret", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adm-secret-"));
    try {
      const a = loadOrCreateSecret(dir);
      const b = loadOrCreateSecret(dir);
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("validation", () => {
  it("validates emails", () => {
    expect(validateEmail("a@b.co").ok).toBe(true);
    expect(validateEmail("nope").ok).toBe(false);
    expect(validateEmail("").ok).toBe(false);
  });
  it("validates password strength", () => {
    expect(validatePassword("Abcd1234").ok).toBe(true);
    expect(validatePassword("short1").ok).toBe(false);
    expect(validatePassword("alllowercase").ok).toBe(false);
  });
});

describe("AuthService", () => {
  it("registers an unverified user and emails a link", async () => {
    const { service, email } = freshService();
    const user = await service.register("Hero@Example.com", "Abcd1234");
    expect(user.email).toBe("hero@example.com");
    expect(user.emailVerified).toBe(false);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.to).toBe("hero@example.com");
    expect(email.sent[0]!.text).toContain("https://dm.example/api/auth/verify?token=");
  });

  it("rejects weak passwords and bad emails before creating a user", async () => {
    const { service, users } = freshService();
    await expect(service.register("a@b.co", "weak")).rejects.toBeInstanceOf(AuthError);
    await expect(service.register("notanemail", "Abcd1234")).rejects.toBeInstanceOf(AuthError);
    expect(users.count()).toBe(0);
  });

  it("rejects duplicate registration with 409", async () => {
    const { service } = freshService();
    await service.register("dup@example.com", "Abcd1234");
    await expect(service.register("dup@example.com", "Abcd1234")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("verifies the email via the emailed token", async () => {
    const { service, users, email } = freshService();
    const user = await service.register("hero@example.com", "Abcd1234");
    expect(users.findById(user.id)!.emailVerified).toBe(false);
    const verified = service.verifyEmail(email.lastToken());
    expect(verified.emailVerified).toBe(true);
    expect(users.findById(user.id)!.emailVerified).toBe(true);
  });

  it("rejects an invalid verification token", () => {
    const { service } = freshService();
    expect(() => service.verifyEmail("garbage")).toThrow(AuthError);
  });

  it("fires onEmailVerified once, only on the first verification", async () => {
    const db = openInMemoryDatabase();
    const users = new UserStore(db);
    const sessions = new SessionStore(db);
    const email = new FakeEmailSender();
    const verified: string[] = [];
    const service = new AuthService(users, sessions, email, {
      secret: "test-secret",
      publicUrl: "https://dm.example",
      onEmailVerified: (u) => verified.push(u.id),
    });
    const user = await service.register("hero@example.com", "Abcd1234");
    const token = email.lastToken();
    service.verifyEmail(token);
    service.verifyEmail(token); // re-clicking the link must not re-fire
    expect(verified).toEqual([user.id]);
  });

  it("re-sends verification only for unverified, existing accounts", async () => {
    const { service, email } = freshService();
    await service.register("hero@example.com", "Abcd1234");
    email.sent = [];
    await service.resendVerification("missing@example.com");
    expect(email.sent).toHaveLength(0);
    await service.resendVerification("hero@example.com");
    expect(email.sent).toHaveLength(1);
    // Once verified, no further resend.
    service.verifyEmail(email.lastToken());
    email.sent = [];
    await service.resendVerification("hero@example.com");
    expect(email.sent).toHaveLength(0);
  });
});

describe("login + sessions (#55c)", () => {
  async function registerVerified(service: AuthService, email: FakeEmailSender) {
    const user = await service.register("hero@example.com", "Abcd1234");
    service.verifyEmail(email.lastToken());
    return user;
  }

  it("logs in with valid credentials and resolves the session", async () => {
    const { service, email } = freshService();
    const user = await registerVerified(service, email);
    const { session, user: who } = await service.login("Hero@Example.com", "Abcd1234");
    expect(who.id).toBe(user.id);
    expect(service.currentUser(session.id)?.id).toBe(user.id);
  });

  it("rejects a wrong password and an unknown email with 401", async () => {
    const { service, email } = freshService();
    await registerVerified(service, email);
    await expect(service.login("hero@example.com", "wrongpass1A")).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(service.login("nobody@example.com", "Abcd1234")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("refuses login for an unverified email with 403", async () => {
    const { service } = freshService();
    await service.register("hero@example.com", "Abcd1234");
    await expect(service.login("hero@example.com", "Abcd1234")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("allows unverified login when requireVerifiedEmail is off", async () => {
    const { service } = freshService(new FakeEmailSender(), { requireVerifiedEmail: false });
    await service.register("hero@example.com", "Abcd1234");
    const { session } = await service.login("hero@example.com", "Abcd1234");
    expect(service.currentUser(session.id)).not.toBeNull();
  });

  it("invalidates the session on logout", async () => {
    const { service, email } = freshService();
    await registerVerified(service, email);
    const { session } = await service.login("hero@example.com", "Abcd1234");
    expect(service.currentUser(session.id)).not.toBeNull();
    service.logout(session.id);
    expect(service.currentUser(session.id)).toBeNull();
  });

  it("treats expired sessions as gone", async () => {
    const { users, sessions } = freshService();
    const u = users.create({ email: "x@y.z", passwordHash: "h" });
    const expired = sessions.create(u.id, -1);
    expect(sessions.get(expired.id)).toBeNull();
  });

  it("returns null for missing/empty session ids", () => {
    const { service } = freshService();
    expect(service.currentUser(undefined)).toBeNull();
    expect(service.currentUser("nope")).toBeNull();
  });
});

describe("password reset (#55d)", () => {
  it("emails a reset link and changes the password", async () => {
    const { service, email } = freshService();
    await service.register("hero@example.com", "Abcd1234");
    service.verifyEmail(email.lastToken());

    email.sent = [];
    await service.requestPasswordReset("Hero@Example.com");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.text).toContain("/api/auth/reset?token=");

    await service.resetPassword(email.lastToken(), "NewPass99");
    // Old password no longer works; new one does.
    await expect(service.login("hero@example.com", "Abcd1234")).rejects.toMatchObject({
      statusCode: 401,
    });
    const { user } = await service.login("hero@example.com", "NewPass99");
    expect(user.email).toBe("hero@example.com");
  });

  it("stays neutral for an unknown email", async () => {
    const { service, email } = freshService();
    await service.requestPasswordReset("nobody@example.com");
    expect(email.sent).toHaveLength(0);
  });

  it("invalidates existing sessions on reset", async () => {
    const { service, email } = freshService();
    await service.register("hero@example.com", "Abcd1234");
    service.verifyEmail(email.lastToken());
    const { session } = await service.login("hero@example.com", "Abcd1234");
    expect(service.currentUser(session.id)).not.toBeNull();

    await service.requestPasswordReset("hero@example.com");
    await service.resetPassword(email.lastToken(), "NewPass99");
    expect(service.currentUser(session.id)).toBeNull();
  });

  it("rejects an invalid token and a weak new password", async () => {
    const { service, email } = freshService();
    await service.register("hero@example.com", "Abcd1234");
    service.verifyEmail(email.lastToken());
    await expect(service.resetPassword("garbage", "NewPass99")).rejects.toMatchObject({
      statusCode: 400,
    });
    await service.requestPasswordReset("hero@example.com");
    await expect(service.resetPassword(email.lastToken(), "weak")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("won't accept a reset token at the verify endpoint (purpose-scoped)", async () => {
    const { service, email } = freshService();
    await service.register("hero@example.com", "Abcd1234");
    email.sent = [];
    await service.requestPasswordReset("hero@example.com");
    expect(() => service.verifyEmail(email.lastToken())).toThrow();
  });
});

describe("account settings (#58a)", () => {
  async function verifiedUser(service: AuthService, email: FakeEmailSender) {
    const user = await service.register("hero@example.com", "Abcd1234");
    service.verifyEmail(email.lastToken());
    return user;
  }

  it("changes the display name", async () => {
    const { service, email } = freshService();
    const user = await verifiedUser(service, email);
    const updated = service.changeDisplayName(user.id, "  Aragorn  ");
    expect(updated.displayName).toBe("Aragorn");
    expect(service.currentUser((await service.login("hero@example.com", "Abcd1234")).session.id)
      ?.displayName).toBe("Aragorn");
  });

  it("changes email, drops verification and emails the new address", async () => {
    const { service, users, email } = freshService();
    const user = await verifiedUser(service, email);
    email.sent = [];
    const updated = await service.changeEmail(user.id, "New@Example.com");
    expect(updated.email).toBe("new@example.com");
    expect(updated.emailVerified).toBe(false);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.to).toBe("new@example.com");
    expect(users.findByEmail("new@example.com")).not.toBeNull();
  });

  it("refuses an email already used by another account", async () => {
    const { service, email } = freshService();
    const user = await verifiedUser(service, email);
    await service.register("other@example.com", "Abcd1234");
    await expect(service.changeEmail(user.id, "other@example.com")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("changes password after verifying the current one and drops sessions", async () => {
    const { service, email } = freshService();
    const user = await verifiedUser(service, email);
    const { session } = await service.login("hero@example.com", "Abcd1234");
    await expect(service.changePassword(user.id, "wrong", "NewPass99")).rejects.toMatchObject({
      statusCode: 401,
    });
    await service.changePassword(user.id, "Abcd1234", "NewPass99");
    // Old session invalidated; old password rejected; new password works.
    expect(service.currentUser(session.id)).toBeNull();
    await expect(service.login("hero@example.com", "Abcd1234")).rejects.toMatchObject({
      statusCode: 401,
    });
    expect((await service.login("hero@example.com", "NewPass99")).user.id).toBe(user.id);
  });

  it("rejects a weak new password", async () => {
    const { service, email } = freshService();
    const user = await verifiedUser(service, email);
    await expect(service.changePassword(user.id, "Abcd1234", "weak")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("deletes the account and its sessions", async () => {
    const { service, users, email } = freshService();
    const user = await verifiedUser(service, email);
    const { session } = await service.login("hero@example.com", "Abcd1234");
    service.deleteAccount(user.id);
    expect(users.findById(user.id)).toBeNull();
    expect(service.currentUser(session.id)).toBeNull();
  });
});

describe("admin role (#57)", () => {
  function adminService(email = new FakeEmailSender()) {
    const db = openInMemoryDatabase();
    const users = new UserStore(db);
    const sessions = new SessionStore(db);
    const service = new AuthService(users, sessions, email, {
      secret: "s",
      publicUrl: "http://localhost",
      adminEmail: "boss@example.com",
    });
    return { users, service, email };
  }

  it("registers the configured admin email with the admin role", async () => {
    const { service } = adminService();
    const admin = await service.register("Boss@Example.com", "Abcd1234");
    expect(admin.role).toBe("admin");
    const normal = await service.register("hero@example.com", "Abcd1234");
    expect(normal.role).toBe("user");
  });

  it("ensureAdmin promotes a pre-existing user", async () => {
    const { service, users } = adminService();
    // Registered as a plain user before the admin email was configured…
    const u = users.create({ email: "boss@example.com", passwordHash: "h" });
    expect(u.role).toBe("user");
    const promoted = service.ensureAdmin();
    expect(promoted?.role).toBe("admin");
    expect(users.findById(u.id)!.role).toBe("admin");
  });

  it("ensureAdmin is a no-op without a matching user", () => {
    const { service } = adminService();
    expect(service.ensureAdmin()).toBeNull();
  });
});
