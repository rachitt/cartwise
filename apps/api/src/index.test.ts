import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp, resolveCorsAllowedOrigins, resolvePort } from "./index.js";

const originalCorsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;

describe("api app hardening", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;

    if (originalCorsAllowedOrigins === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = originalCorsAllowedOrigins;
    }
  });

  it("validates PORT as a concrete TCP port", () => {
    expect(resolvePort("3000")).toBe(3000);
    expect(resolvePort("65535")).toBe(65_535);
    expect(() => resolvePort("0")).toThrow(/PORT must be an integer/);
    expect(() => resolvePort("65536")).toThrow(/PORT must be an integer/);
    expect(() => resolvePort("abc")).toThrow(/PORT must be an integer/);
    expect(() => resolvePort("3000.5")).toThrow(/PORT must be an integer/);
  });

  it("parses CORS allowlist origins from comma-separated env syntax", () => {
    expect(Array.from(resolveCorsAllowedOrigins("https://app.example.test, http://localhost:8081/"))).toEqual([
      "https://app.example.test",
      "http://localhost:8081",
    ]);
  });

  it("only reflects default allowed local origins", async () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    app = await buildTestApp();

    const allowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:8081" },
    });
    const denied = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example.test" },
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:8081");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("uses CORS_ALLOWED_ORIGINS when configured", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.test";
    app = await buildTestApp();

    const allowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://app.example.test" },
    });
    const deniedDefault = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:8081" },
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example.test");
    expect(deniedDefault.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("subjects CORS preflight requests to the rate limiter", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:8081";
    app = await buildTestApp({ rateLimitMax: 1 });

    const first = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: { origin: "http://localhost:8081" },
    });
    const second = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: { origin: "http://localhost:8081" },
    });

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({ error: "Too many requests" });
  });

  it("keeps validation failures as 4xx responses", async () => {
    app = await buildTestApp();
    app.get(
      "/test/validation",
      {
        schema: {
          querystring: {
            type: "object",
            required: ["name"],
            properties: { name: { type: "string" } },
          },
        },
      },
      async () => ({ ok: true }),
    );

    const response = await app.inject({ method: "GET", url: "/test/validation" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid request" });
  });

  it("returns safe 503 bodies for database and unexpected failures", async () => {
    app = await buildTestApp();
    app.get("/test/db-error", async () => {
      const error = new Error("connect ECONNREFUSED postgres://user:secret@localhost:5432/cartwise") as Error & {
        code: string;
      };
      error.code = "ECONNREFUSED";
      throw error;
    });
    app.get("/test/unexpected-error", async () => {
      throw new Error("unexpected password=secret failure");
    });

    const dbFailure = await app.inject({ method: "GET", url: "/test/db-error" });
    const unexpectedFailure = await app.inject({ method: "GET", url: "/test/unexpected-error" });

    expect(dbFailure.statusCode).toBe(503);
    expect(dbFailure.json()).toEqual({ error: "Database unavailable" });
    expect(dbFailure.body).not.toContain("secret");
    expect(unexpectedFailure.statusCode).toBe(503);
    expect(unexpectedFailure.json()).toEqual({ error: "Service unavailable" });
    expect(unexpectedFailure.body).not.toContain("secret");
  });

  async function buildTestApp(options: Parameters<typeof buildApp>[0] = {}): Promise<FastifyInstance> {
    return buildApp({ logger: false, ...options });
  }
});
