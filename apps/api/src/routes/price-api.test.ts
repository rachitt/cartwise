import type { ChainSlug } from "@cartwise/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createCache, type CacheDb } from "../cache.js";
import type { Collector, CollectedStore } from "../collectors/types.js";
import type { CacheEntry, CartwiseDb } from "../db/repository.js";
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

describe("priceApiPlugin collector degradation", () => {
  let app: ReturnType<typeof Fastify> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("returns 200 when one chain succeeds and another throws", async () => {
    app = Fastify();
    const db = fakePriceDb();
    await app.register(priceApiPlugin, {
      db,
      getCollector: (chain: ChainSlug) => {
        if (chain === "kroger") {
          return collectorFor(chain, {
            stores: [
              {
                externalLocationId: "kroger-1",
                name: "Kroger",
                address: "1 Main St",
                zip: "45202",
                lat: 39.1,
                lng: -84.5,
              },
            ],
          });
        }
        if (chain === "target") {
          return throwingCollector(chain);
        }

        return null;
      },
    });

    const response = await app.inject({ method: "GET", url: "/stores?zip=45202" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.stores).toEqual([
      expect.objectContaining({ chain: "kroger", name: "Kroger", zip: "45202" }),
    ]);
    expect(body.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chain: "kroger", status: "live" }),
        { chain: "target", status: "error" },
      ]),
    );
  });

  it("returns 503 when all configured chains throw with a cold cache", async () => {
    app = Fastify();
    await app.register(priceApiPlugin, {
      db: fakePriceDb(),
      getCollector: (chain: ChainSlug) => throwingCollector(chain),
    });

    const response = await app.inject({ method: "GET", url: "/stores?zip=45202" });
    const body = response.json();

    expect(response.statusCode).toBe(503);
    expect(body).toEqual({
      error: "Collectors unavailable",
      sources: [
        { chain: "kroger", status: "error" },
        { chain: "target", status: "error" },
        { chain: "walmart", status: "error" },
        { chain: "aldi", status: "error" },
      ],
    });
  });

  it("returns 200 with stale sources when all configured chains throw and expired cache exists", async () => {
    const now = new Date("2026-07-04T12:00:00Z");
    const capturedAt = new Date("2026-07-03T12:00:00Z");
    const db = fakePriceDb({
      "stores:kroger:45202": {
        value: [
          {
            externalLocationId: "kroger-stale",
            name: "Cached Kroger",
            address: "1 Old St",
            zip: "45202",
            lat: 39.1,
            lng: -84.5,
          },
        ],
        storedAt: capturedAt,
        expiresAt: new Date("2026-07-03T13:00:00Z"),
      },
      "stores:target:45202": {
        value: [
          {
            externalLocationId: "target-stale",
            name: "Cached Target",
            address: "2 Old St",
            zip: "45202",
            lat: 39.2,
            lng: -84.4,
          },
        ],
        storedAt: capturedAt,
        expiresAt: new Date("2026-07-03T13:00:00Z"),
      },
    });
    app = Fastify();
    await app.register(priceApiPlugin, {
      db,
      getCollector: (chain: ChainSlug) =>
        chain === "kroger" || chain === "target" ? throwingCollector(chain) : null,
      cache: createCache(db, () => now),
    });

    const response = await app.inject({ method: "GET", url: "/stores?zip=45202" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.stores).toHaveLength(2);
    expect(body.sources).toEqual(
      expect.arrayContaining([
        { chain: "kroger", status: "stale", capturedAt: capturedAt.toISOString() },
        { chain: "target", status: "stale", capturedAt: capturedAt.toISOString() },
        { chain: "walmart", status: "unavailable" },
        { chain: "aldi", status: "unavailable" },
      ]),
    );
  });

  it("marks disabled collectors as unavailable", async () => {
    app = Fastify();
    await app.register(priceApiPlugin, {
      db: fakePriceDb(),
      getCollector: () => null,
    });

    const response = await app.inject({ method: "GET", url: "/stores?zip=45202" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      stores: [],
      sources: [
        { chain: "kroger", status: "unavailable" },
        { chain: "target", status: "unavailable" },
        { chain: "walmart", status: "unavailable" },
        { chain: "aldi", status: "unavailable" },
      ],
    });
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

function collectorFor(
  chain: ChainSlug,
  data: {
    stores?: CollectedStore[];
  },
): Collector {
  return {
    chain,
    async findStores() {
      return data.stores ?? [];
    },
    async searchProducts() {
      return [];
    },
    async getPrices() {
      return [];
    },
  };
}

function throwingCollector(chain: ChainSlug): Collector {
  return {
    chain,
    async findStores() {
      throw new Error(`${chain} failed`);
    },
    async searchProducts() {
      throw new Error(`${chain} failed`);
    },
    async getPrices() {
      throw new Error(`${chain} failed`);
    },
  };
}

interface CachedValue {
  value: unknown;
  storedAt: Date;
  expiresAt: Date;
}

function fakePriceDb(initialCache: Record<string, CachedValue> = {}): CartwiseDb & CacheDb {
  const cacheEntries = new Map<string, CacheEntry>(
    Object.entries(initialCache).map(([key, cached]) => [
      key,
      {
        key,
        payload: { v: cached.value, storedAt: cached.storedAt.toISOString() },
        expiresAt: cached.expiresAt,
      },
    ]),
  );

  let storeIndex = 0;

  const target = {
    async getCacheEntry(key: string) {
      return cacheEntries.get(key) ?? null;
    },
    async setCacheEntry(key: string, payload: unknown, expiresAt: Date) {
      cacheEntries.set(key, { key, payload, expiresAt });
    },
    async upsertStore(chain: ChainSlug, store: CollectedStore) {
      storeIndex += 1;
      return {
        id: `00000000-0000-4000-8000-${String(storeIndex).padStart(12, "0")}`,
        chainSlug: chain,
        externalLocationId: store.externalLocationId,
        name: store.name,
        address: store.address,
        zip: store.zip,
        lat: store.lat,
        lng: store.lng,
      };
    },
  };

  const proxied = new Proxy(target, {
    get(targetObject, property) {
      if (property in targetObject) {
        return targetObject[property as keyof typeof targetObject];
      }

      return async () => {
        throw new Error(`Unexpected DB call: ${String(property)}`);
      };
    },
  });

  return proxied as CartwiseDb & CacheDb;
}
