/**
 * CSRF header injection (#59a). The server rejects any mutating `/api` request
 * that lacks a custom header (a forged cross-site `POST` can't set one without a
 * CORS preflight it won't pass). Rather than touch every `fetch` call site, we
 * patch `window.fetch` once at startup to add the header to same-origin,
 * state-changing requests. Import this for its side effect before the app
 * mounts.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isSameOrigin(input: RequestInfo | URL): boolean {
  try {
    const url =
      typeof input === "string"
        ? new URL(input, window.location.href)
        : input instanceof URL
          ? input
          : new URL(input.url, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    // Opaque/relative inputs we can't parse are treated as same-origin (the app
    // only ever calls its own API with relative paths).
    return true;
  }
}

const originalFetch = window.fetch.bind(window);

window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (SAFE_METHODS.has(method) || !isSameOrigin(input)) {
    return originalFetch(input, init);
  }
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has("X-Requested-With")) headers.set("X-Requested-With", "fetch");
  return originalFetch(input, { ...init, headers });
};
