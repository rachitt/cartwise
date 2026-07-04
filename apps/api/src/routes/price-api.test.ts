import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type { CartwiseDb } from "../db/repository.js";
import { priceApiPlugin } from "./price-api.js";

describe("priceApiPlugin validation", () => {
  let app: ReturnType<typeof Fastify> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("returns 400 for an invalid stores zip", async () => {
    app = Fastify();
    await app.register(priceApiPlugin, {
      db: throwingDb(),
      getCollector: () => null,
    });

    const response = await app.inject({ method: "GET", url: "/stores?zip=abcde" });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for invalid search storeIds", async () => {
    app = Fastify();
    await app.register(priceApiPlugin, {
      db: throwingDb(),
      getCollector: () => null,
    });

    const response = await app.inject({ method: "GET", url: "/search?q=milk&storeIds=bad-id" });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when search has more than eight stores", async () => {
    app = Fastify();
    await app.register(priceApiPlugin, {
      db: throwingDb(),
      getCollector: () => null,
    });
    const storeIds = Array.from(
      { length: 9 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ).join(",");

    const response = await app.inject({ method: "GET", url: `/search?q=milk&storeIds=${storeIds}` });

    expect(response.statusCode).toBe(400);
  });
});

function throwingDb(): CartwiseDb {
  return new Proxy(
    {},
    {
      get() {
        return async () => {
          throw new Error("DB should not be called for validation failures");
        };
      },
    },
  ) as CartwiseDb;
}
