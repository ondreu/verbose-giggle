/**
 * Signed, expiring tokens (#55b) — used for email verification and, later,
 * password reset (#55d). Stateless: an HMAC over a small JSON payload, so no
 * DB table is needed and tokens self-expire. The signing secret is stable
 * across restarts (see {@link loadOrCreateSecret}).
 *
 * Format: `<base64url(payload)>.<base64url(hmac-sha256)>` where the payload is
 * `{ sub, purpose, exp }` (exp = epoch ms). `purpose` scopes a token so a
 * verification link can't be replayed as a password reset.
 */
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type TokenPurpose = "verify-email" | "reset-password";

interface TokenPayload {
  sub: string;
  purpose: TokenPurpose;
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/** Mint a token for `userId` scoped to `purpose`, valid for `ttlMs`. */
export function createToken(
  userId: string,
  purpose: TokenPurpose,
  secret: string,
  ttlMs: number,
): string {
  const payload: TokenPayload = { sub: userId, purpose, exp: Date.now() + ttlMs };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" | "wrong-purpose" };

/** Verify a token's signature, purpose and expiry. Never throws. */
export function verifyToken(
  token: string,
  purpose: TokenPurpose,
  secret: string,
): VerifyResult {
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload.sub !== "string" || typeof payload.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (payload.purpose !== purpose) return { ok: false, reason: "wrong-purpose" };
  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };
  return { ok: true, userId: payload.sub };
}

/**
 * Resolve the HMAC secret: `AUTH_SECRET` env wins; otherwise read (or create
 * once) a random secret persisted next to the app DB so tokens survive
 * restarts. The file is the operator's to back up alongside the vault.
 */
export function loadOrCreateSecret(vaultPath: string): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const dir = path.join(vaultPath, "db");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "auth-secret");
  if (existsSync(file)) {
    const v = readFileSync(file, "utf8").trim();
    if (v) return v;
  }
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}
