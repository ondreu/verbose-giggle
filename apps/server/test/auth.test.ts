import { describe, expect, it } from "vitest";
import { openInMemoryDatabase } from "../src/db/database.js";
import { UserStore } from "../src/auth/users.js";
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
  /** Pull the verification token out of the most recent email's link. */
  lastToken(): string {
    const text = this.sent.at(-1)?.text ?? "";
    return /token=([^\s&]+)/.exec(text)?.[1] ?? "";
  }
}

function freshService(email = new FakeEmailSender()) {
  const users = new UserStore(openInMemoryDatabase());
  const service = new AuthService(users, email, {
    secret: "test-secret",
    publicUrl: "https://dm.example",
  });
  return { users, service, email };
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
