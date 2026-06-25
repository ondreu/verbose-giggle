/**
 * Tiny in-memory rate limiter (#59b) — brute-force protection for the auth
 * endpoints. Self-hosted runs on a single process, so a fixed-window counter in
 * a `Map` is enough; no external store/dependency. Keyed by caller (IP) + route.
 *
 * Pure and clock-injectable so it can be unit-tested without real time. The HTTP
 * layer (`routes/auth.ts`) calls {@link RateLimiter.hit} before doing work and
 * {@link RateLimiter.reset} after a successful login so honest users who finally
 * get their password right aren't left locked out by earlier typos.
 */

export interface RateLimitOptions {
  /** Max attempts allowed within a window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Clock, injectable for tests. Defaults to {@link Date.now}. */
  now?: () => number;
}

export interface RateLimitResult {
  /** Whether this attempt is allowed (false once the window limit is hit). */
  allowed: boolean;
  /** Attempts remaining in the current window (0 when blocked). */
  remaining: number;
  /** Milliseconds until the window resets (for a `Retry-After` header). */
  retryAfterMs: number;
}

interface Bucket {
  /** Attempt count in the current window. */
  count: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(opts: RateLimitOptions) {
    this.max = opts.max;
    this.windowMs = opts.windowMs;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Record an attempt for `key` and report whether it is allowed. Expired
   * windows roll over automatically. When the limit is already reached the
   * count is NOT incremented further, so the window can't be extended by
   * hammering it; `retryAfterMs` always reflects the original reset time.
   */
  hit(key: string): RateLimitResult {
    const t = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || t >= bucket.resetAt) {
      bucket = { count: 0, resetAt: t + this.windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= this.max) {
      return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - t };
    }
    bucket.count += 1;
    return {
      allowed: true,
      remaining: this.max - bucket.count,
      retryAfterMs: bucket.resetAt - t,
    };
  }

  /** Clear a key's window (e.g. after a successful login). */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Drop expired buckets so the map can't grow without bound under a spray of
   * distinct keys. Cheap to call periodically from a timer.
   */
  prune(): void {
    const t = this.now();
    for (const [key, bucket] of this.buckets) {
      if (t >= bucket.resetAt) this.buckets.delete(key);
    }
  }
}
