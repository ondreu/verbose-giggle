import { describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerCsrfGuard } from "../src/auth/middleware.js";

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  registerCsrfGuard(app);
  app.get("/api/thing", async () => ({ ok: true }));
  app.post("/api/thing", async () => ({ ok: true }));
  app.get("/", async () => "page");
  await app.ready();
  return app;
}

describe("CSRF guard (#59a)", () => {
  it("allows safe methods without the header", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/thing" });
    expect(res.statusCode).toBe(200);
  });

  it("rejects a mutating /api request missing the header", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/api/thing", payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it("allows a mutating /api request carrying the header", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/thing",
      headers: { "x-requested-with": "fetch" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it("ignores non-/api paths", async () => {
    const app = await buildApp();
    // A POST to a non-API path isn't guarded (no such route here -> 404, not 403).
    const res = await app.inject({ method: "POST", url: "/" });
    expect(res.statusCode).not.toBe(403);
  });
});
