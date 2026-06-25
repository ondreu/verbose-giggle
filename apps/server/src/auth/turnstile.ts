/**
 * Cloudflare Turnstile CAPTCHA verification (#59b). A lightweight bot check on
 * the credential endpoints (login / register) that complements the per-IP
 * rate-limit. Active only when a secret key is configured, so self-hosted / BYO
 * deployments run exactly as before with no widget and no extra request.
 *
 * The browser solves a challenge and posts the resulting token alongside the
 * credentials; the server hands it to Cloudflare's siteverify endpoint together
 * with the client IP. We never trust the client's claim — only Cloudflare's
 * verdict.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Shape of Cloudflare's siteverify JSON response (only the fields we read). */
interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export interface TurnstileVerifier {
  /** The public site key the frontend widget renders with. */
  readonly siteKey: string;
  /** Verify a solved token for `ip`; true = human. Network/HTTP errors → false. */
  verify(token: string | undefined, ip: string): Promise<boolean>;
}

/** A `fetch` of the shape we need, so tests can inject a stub. */
type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * Build a Turnstile verifier from the keypair, or null when no secret key is
 * set (CAPTCHA disabled). `fetchImpl` defaults to the global fetch; tests pass
 * a stub to avoid a network call.
 */
export function makeTurnstileVerifier(
  opts: { secretKey: string | null; siteKey: string | null },
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): TurnstileVerifier | null {
  const secret = opts.secretKey?.trim();
  const site = opts.siteKey?.trim();
  if (!secret || !site) return null;
  return {
    siteKey: site,
    async verify(token, ip) {
      if (!token) return false;
      try {
        const res = await fetchImpl(SITEVERIFY_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as SiteverifyResponse;
        return data.success === true;
      } catch {
        // Fail closed: a Cloudflare outage shouldn't silently disable the check.
        return false;
      }
    },
  };
}
