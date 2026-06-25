/**
 * Auth service (#55b) — registration + email verification on top of the
 * #55a data layer. Pure-ish orchestration (DB + token + email) so it can be
 * unit-tested with a fake email sender; the HTTP layer (`routes/auth.ts`) is a
 * thin wrapper. Login/session (#55c) and reset (#55d) extend this service.
 */
import { hashPassword, verifyPassword } from "./password.js";
import { createToken, verifyToken } from "./tokens.js";
import { validateEmail, validatePassword } from "./validation.js";
import { passwordResetEmail, verificationEmail, type EmailSender } from "./email.js";
import { DuplicateEmailError, normalizeEmail, type User, type UserStore } from "./users.js";
import type { Session, SessionStore } from "./sessions.js";

export interface AuthServiceOptions {
  /** HMAC secret for signed tokens. */
  secret: string;
  /** Absolute base URL used to build email links (no trailing slash). */
  publicUrl: string;
  /** Verification-link lifetime. Defaults to 24h. */
  verifyTtlMs?: number;
  /** Password-reset-link lifetime. Defaults to 1h. */
  resetTtlMs?: number;
  /** Login session lifetime. Defaults to 30 days. */
  sessionTtlMs?: number;
  /**
   * Require a verified email before login is allowed. Defaults to true.
   * Accepts a getter so a live config change (admin panel, #57b) is honoured.
   */
  requireVerifiedEmail?: boolean | (() => boolean);
  /** Email granted the admin role on registration / bootstrap (#57). */
  adminEmail?: string | null;
  /**
   * Called once when a user's email transitions to verified for the first time
   * (#55/#56). Used to grant the one-time signup credit bonus. Best-effort: a
   * throw here must not break verification, so the caller wraps it.
   */
  onEmailVerified?: (user: User) => void;
}

/** A client-facing failure with an HTTP status and a Czech message. */
export class AuthError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LoginResult {
  user: User;
  session: Session;
}

export class AuthService {
  private readonly verifyTtlMs: number;
  private readonly resetTtlMs: number;
  private readonly sessionTtlMs: number;
  private readonly requireVerifiedEmail: () => boolean;

  constructor(
    private readonly users: UserStore,
    private readonly sessions: SessionStore,
    private readonly email: EmailSender,
    private readonly opts: AuthServiceOptions,
  ) {
    this.verifyTtlMs = opts.verifyTtlMs ?? DAY_MS;
    this.resetTtlMs = opts.resetTtlMs ?? 60 * 60 * 1000;
    this.sessionTtlMs = opts.sessionTtlMs ?? 30 * DAY_MS;
    const rve = opts.requireVerifiedEmail ?? true;
    this.requireVerifiedEmail = typeof rve === "function" ? rve : () => rve;
  }

  /** Session lifetime in ms (the cookie route mirrors this as Max-Age). */
  get sessionMaxAgeMs(): number {
    return this.sessionTtlMs;
  }

  private link(pathname: string, token: string): string {
    const base = this.opts.publicUrl.replace(/\/+$/, "");
    return `${base}${pathname}?token=${encodeURIComponent(token)}`;
  }

  private verifyLink(token: string): string {
    return this.link("/api/auth/verify", token);
  }

  /** Send (or re-send) a verification email for an existing user. */
  private async sendVerification(user: User): Promise<void> {
    const token = createToken(user.id, "verify-email", this.opts.secret, this.verifyTtlMs);
    await this.email.send(verificationEmail(user.email, this.verifyLink(token)));
  }

  /**
   * Register a new user (unverified) and email a verification link. Throws
   * {@link AuthError} on invalid input or a duplicate email.
   */
  async register(emailInput: string, password: string): Promise<User> {
    const emailCheck = validateEmail(emailInput);
    if (!emailCheck.ok) throw new AuthError(400, emailCheck.error!);
    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) throw new AuthError(400, pwCheck.error!);

    const passwordHash = await hashPassword(password);
    const isAdmin =
      this.opts.adminEmail != null && normalizeEmail(emailInput) === this.opts.adminEmail;
    let user: User;
    try {
      user = this.users.create({ email: emailInput, passwordHash, role: isAdmin ? "admin" : "user" });
    } catch (err) {
      if (err instanceof DuplicateEmailError) {
        throw new AuthError(409, "Účet s tímto e-mailem už existuje.");
      }
      throw err;
    }
    await this.sendVerification(user);
    return user;
  }

  /** Re-send the verification email if the account exists and is unverified. */
  async resendVerification(emailInput: string): Promise<void> {
    const user = this.users.findByEmail(emailInput);
    // Stay quiet on unknown/already-verified to avoid leaking account state.
    if (!user || user.emailVerified) return;
    await this.sendVerification(user);
  }

  /**
   * Verify an email-verification token and mark the user verified. Returns the
   * (now verified) user. Throws {@link AuthError} on a bad/expired token.
   */
  verifyEmail(token: string): User {
    const result = verifyToken(token, "verify-email", this.opts.secret);
    if (!result.ok) {
      const msg =
        result.reason === "expired"
          ? "Ověřovací odkaz vypršel. Nech si poslat nový."
          : "Neplatný ověřovací odkaz.";
      throw new AuthError(400, msg);
    }
    const user = this.users.findById(result.userId);
    if (!user) throw new AuthError(400, "Účet nenalezen.");
    const verified = { ...user, emailVerified: true };
    if (!user.emailVerified) {
      this.users.setEmailVerified(user.id, true);
      // First-time verification → fire the hook (e.g. signup credit bonus).
      // Best-effort: a failure here must not block the user's verification.
      try {
        this.opts.onEmailVerified?.(verified);
      } catch {
        /* swallow — bonus is non-critical */
      }
    }
    return verified;
  }

  /**
   * Verify credentials and open a session. Uses a uniform error for unknown
   * email and wrong password so the response can't distinguish them. Throws
   * {@link AuthError} 403 when the email isn't verified yet.
   */
  async login(emailInput: string, password: string): Promise<LoginResult> {
    const invalid = new AuthError(401, "Nesprávný e-mail nebo heslo.");
    if (typeof emailInput !== "string" || typeof password !== "string") throw invalid;

    const user = this.users.findByEmail(emailInput);
    if (!user) {
      // Still run a hash to keep timing roughly uniform against enumeration.
      await verifyPassword(password, "scrypt$1$1$1$00$00");
      throw invalid;
    }
    const hash = this.users.getPasswordHash(user.id);
    if (!hash || !(await verifyPassword(password, hash))) throw invalid;

    if (this.requireVerifiedEmail() && !user.emailVerified) {
      throw new AuthError(403, "Než se přihlásíš, ověř svůj e-mail.");
    }

    const session = this.sessions.create(user.id, this.sessionTtlMs);
    return { user, session };
  }

  /** Invalidate a session id (logout). No-op if it doesn't exist. */
  logout(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Resolve the user behind a session id, or null if missing/expired. */
  currentUser(sessionId: string | undefined): User | null {
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return this.users.findById(session.userId);
  }

  /**
   * Email a password-reset link if the account exists. Always resolves without
   * signalling whether the address is registered (no enumeration).
   */
  async requestPasswordReset(emailInput: string): Promise<void> {
    const user = this.users.findByEmail(emailInput);
    if (!user) return;
    const token = createToken(user.id, "reset-password", this.opts.secret, this.resetTtlMs);
    await this.email.send(passwordResetEmail(user.email, this.link("/api/auth/reset", token)));
  }

  /**
   * Set a new password from a valid reset token. Invalidates the user's
   * existing sessions so a leaked session can't outlive the reset. Throws
   * {@link AuthError} on a bad/expired token or weak password.
   */
  async resetPassword(token: string, newPassword: string): Promise<User> {
    const result = verifyToken(token, "reset-password", this.opts.secret);
    if (!result.ok) {
      const msg =
        result.reason === "expired"
          ? "Odkaz pro obnovení hesla vypršel. Vyžádej si nový."
          : "Neplatný odkaz pro obnovení hesla.";
      throw new AuthError(400, msg);
    }
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.ok) throw new AuthError(400, pwCheck.error!);

    const user = this.users.findById(result.userId);
    if (!user) throw new AuthError(400, "Účet nenalezen.");

    this.users.setPasswordHash(user.id, await hashPassword(newPassword));
    // A reset implies the address is controlled by the user; treat it as
    // verification too, and drop all other sessions.
    if (!user.emailVerified) this.users.setEmailVerified(user.id, true);
    this.sessions.deleteForUser(user.id);
    return { ...user, emailVerified: true };
  }

  // --- Account settings (#58a) ---------------------------------------------

  /** Update the display name. */
  changeDisplayName(userId: string, displayName: string | null): User {
    const user = this.users.findById(userId);
    if (!user) throw new AuthError(404, "Účet nenalezen.");
    const trimmed = displayName?.trim() || null;
    this.users.updateProfile(userId, { displayName: trimmed });
    return { ...user, displayName: trimmed };
  }

  /**
   * Change the email. Resets verification (sends a new verification link to the
   * new address) since the user must prove control of it. Throws on invalid or
   * already-taken email.
   */
  async changeEmail(userId: string, newEmail: string): Promise<User> {
    const user = this.users.findById(userId);
    if (!user) throw new AuthError(404, "Účet nenalezen.");
    const check = validateEmail(newEmail);
    if (!check.ok) throw new AuthError(400, check.error!);

    const existing = this.users.findByEmail(newEmail);
    if (existing && existing.id !== userId) {
      throw new AuthError(409, "Tento e-mail už používá jiný účet.");
    }
    try {
      this.users.updateProfile(userId, { email: newEmail });
    } catch (err) {
      if (err instanceof DuplicateEmailError) {
        throw new AuthError(409, "Tento e-mail už používá jiný účet.");
      }
      throw err;
    }
    this.users.setEmailVerified(userId, false);
    const updated = this.users.findById(userId)!;
    await this.sendVerification(updated);
    return updated;
  }

  /**
   * Change the password after re-checking the current one. Invalidates every
   * session for the user; the caller may open a fresh one for the current
   * device. Throws {@link AuthError} on a wrong current or weak new password.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const hash = this.users.getPasswordHash(userId);
    if (!hash || !(await verifyPassword(currentPassword, hash))) {
      throw new AuthError(401, "Současné heslo je nesprávné.");
    }
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.ok) throw new AuthError(400, pwCheck.error!);
    this.users.setPasswordHash(userId, await hashPassword(newPassword));
    this.sessions.deleteForUser(userId);
  }

  /**
   * Delete the account (GDPR). Removes sessions then the user row. NOTE: the
   * user's vault data is cleaned up once per-user data isolation lands (#55f
   * part 2); until then accounts don't own vault folders.
   */
  deleteAccount(userId: string): void {
    this.sessions.deleteForUser(userId);
    this.users.delete(userId);
  }

  /** Open a fresh session for a user (used after a password change). */
  openSession(userId: string) {
    return this.sessions.create(userId, this.sessionTtlMs);
  }

  // --- Admin (#57) ----------------------------------------------------------

  /**
   * Promote the configured admin email to the admin role if that user exists.
   * Called at startup so a designated operator becomes admin even if they
   * registered before the email was configured. Returns the user, or null.
   */
  ensureAdmin(): User | null {
    if (!this.opts.adminEmail) return null;
    const user = this.users.findByEmail(this.opts.adminEmail);
    if (!user) return null;
    if (user.role !== "admin") this.users.setRole(user.id, "admin");
    return { ...user, role: "admin" };
  }
}
