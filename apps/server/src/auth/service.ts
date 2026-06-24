/**
 * Auth service (#55b) — registration + email verification on top of the
 * #55a data layer. Pure-ish orchestration (DB + token + email) so it can be
 * unit-tested with a fake email sender; the HTTP layer (`routes/auth.ts`) is a
 * thin wrapper. Login/session (#55c) and reset (#55d) extend this service.
 */
import { hashPassword } from "./password.js";
import { createToken, verifyToken } from "./tokens.js";
import { validateEmail, validatePassword } from "./validation.js";
import { verificationEmail, type EmailSender } from "./email.js";
import { DuplicateEmailError, type User, type UserStore } from "./users.js";

export interface AuthServiceOptions {
  /** HMAC secret for signed tokens. */
  secret: string;
  /** Absolute base URL used to build email links (no trailing slash). */
  publicUrl: string;
  /** Verification-link lifetime. Defaults to 24h. */
  verifyTtlMs?: number;
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

export class AuthService {
  private readonly verifyTtlMs: number;

  constructor(
    private readonly users: UserStore,
    private readonly email: EmailSender,
    private readonly opts: AuthServiceOptions,
  ) {
    this.verifyTtlMs = opts.verifyTtlMs ?? DAY_MS;
  }

  private verifyLink(token: string): string {
    const base = this.opts.publicUrl.replace(/\/+$/, "");
    return `${base}/api/auth/verify?token=${encodeURIComponent(token)}`;
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
    let user: User;
    try {
      user = this.users.create({ email: emailInput, passwordHash });
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
    if (!user.emailVerified) this.users.setEmailVerified(user.id, true);
    return { ...user, emailVerified: true };
  }
}
