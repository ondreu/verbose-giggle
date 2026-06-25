import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/auth/rate-limit.js";

/** A controllable clock so the window logic is tested without real time. */
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("RateLimiter", () => {
  it("allows up to max attempts then blocks within the window", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ max: 3, windowMs: 1000, now: clock.now });

    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(true);
    const third = rl.hit("a");
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const blocked = rl.hit("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
  });

  it("keys are independent", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ max: 1, windowMs: 1000, now: clock.now });
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(false);
    expect(rl.hit("b").allowed).toBe(true);
  });

  it("rolls over once the window elapses", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ max: 1, windowMs: 1000, now: clock.now });
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(false);
    clock.advance(1000);
    expect(rl.hit("a").allowed).toBe(true);
  });

  it("does not extend the window by hammering while blocked", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ max: 1, windowMs: 1000, now: clock.now });
    rl.hit("a");
    rl.hit("a"); // blocked
    clock.advance(400);
    const r = rl.hit("a"); // still blocked, original reset stands
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBe(600);
  });

  it("reset clears a key", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ max: 1, windowMs: 1000, now: clock.now });
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(false);
    rl.reset("a");
    expect(rl.hit("a").allowed).toBe(true);
  });

  it("prune drops only expired buckets", () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ max: 1, windowMs: 1000, now: clock.now });
    rl.hit("a");
    clock.advance(1000);
    rl.hit("b");
    rl.prune();
    // "a" expired and was pruned -> a fresh window; "b" still counts.
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("b").allowed).toBe(false);
  });
});
