import { describe, expect, it, vi } from "vitest";
import { makeTurnstileVerifier } from "../src/auth/turnstile.js";

/** A fetch stub returning a canned siteverify response. */
function stubFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }));
}

describe("makeTurnstileVerifier (#59b)", () => {
  it("is disabled (null) without both keys", () => {
    expect(makeTurnstileVerifier({ siteKey: "s", secretKey: null })).toBeNull();
    expect(makeTurnstileVerifier({ siteKey: null, secretKey: "x" })).toBeNull();
    expect(makeTurnstileVerifier({ siteKey: "  ", secretKey: "x" })).toBeNull();
  });

  it("exposes the site key and verifies a good token", async () => {
    const fetchImpl = stubFetch({ success: true });
    const v = makeTurnstileVerifier({ siteKey: "site", secretKey: "secret" }, fetchImpl)!;
    expect(v.siteKey).toBe("site");
    expect(await v.verify("tok", "1.2.3.4")).toBe(true);

    // The secret, token and client IP are forwarded to Cloudflare.
    const body = (fetchImpl.mock.calls[0]![1] as { body: string }).body;
    expect(body).toContain("secret=secret");
    expect(body).toContain("response=tok");
    expect(body).toContain("remoteip=1.2.3.4");
  });

  it("rejects a missing token without calling Cloudflare", async () => {
    const fetchImpl = stubFetch({ success: true });
    const v = makeTurnstileVerifier({ siteKey: "site", secretKey: "secret" }, fetchImpl)!;
    expect(await v.verify(undefined, "1.2.3.4")).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed on an unsuccessful verdict, HTTP error, or thrown fetch", async () => {
    const bad = makeTurnstileVerifier({ siteKey: "s", secretKey: "x" }, stubFetch({ success: false }))!;
    expect(await bad.verify("tok", "ip")).toBe(false);

    const http = makeTurnstileVerifier({ siteKey: "s", secretKey: "x" }, stubFetch({ success: true }, false))!;
    expect(await http.verify("tok", "ip")).toBe(false);

    const thrown = makeTurnstileVerifier(
      { siteKey: "s", secretKey: "x" },
      vi.fn(async () => {
        throw new Error("network");
      }),
    )!;
    expect(await thrown.verify("tok", "ip")).toBe(false);
  });
});
