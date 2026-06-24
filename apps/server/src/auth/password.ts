/**
 * Password hashing (#55a).
 *
 * The roadmap asks for argon2/bcrypt; both are native modules that need a build
 * step in the Alpine image. We instead use Node's built-in `crypto.scrypt`, a
 * memory-hard KDF from the same family, so there's no native dependency. The
 * stored format is self-describing so we can migrate to argon2 later without a
 * flag day:
 *
 *   scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
 *
 * `verifyPassword` reads the parameters from the stored string, so old hashes
 * keep verifying if we tune the cost for new ones.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// OWASP-suggested scrypt baseline (N=2^17). r/p left at the common defaults.
const N = 1 << 17;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem must be raised above the default 32 MiB for N=2^17 (~128*N*r bytes).
    scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (err, dk) => {
      if (err) reject(err);
      else resolve(dk);
    });
  });
}

/** Hash a plaintext password into a self-describing, storable string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const dk = await scryptAsync(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${dk.toString("hex")}`;
}

/** Verify a plaintext password against a stored hash. Never throws on bad input. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex!, "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = await scryptAsync(password, Buffer.from(saltHex!, "hex"), n, r, p);
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
