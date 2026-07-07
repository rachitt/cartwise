import type { ChainSlug } from "@cartwise/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createCache, type CacheDb } from "../cache.js";
import type { CollectedProduct, Collector, CollectedStore } from "../collectors/types.js";
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

  it("returns 400 when search has more than forty stores", async () => {
    app = Fastify();
    await app.register(priceApiPlugin, {
      db: throwingDb(),
      getCollector: () => null,
    });
    const storeIds = Array.from(
      { length: 41 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ).join(",");

    const response = await app.inject({ method: "GET", url: `/search?q=milk&storeIds=${storeIds}` });

    expect(response.statusCode).toBe(400);
  });
});

describe("priceApiPlugin coverage", () => {
  let app: ReturnType<typeof Fastify> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("returns 400 for an invalid coverage ZIP", async () => {
    app = Fastify();
    await app.register(priceApiPlugin, {
      db: throwingDb(),
      getCollector: () => null,
    });

    const response = await app.inject({ method: "GET", url: "/v1/coverage?zip=abcde" });

    expect(response.statusCode).toBe(400);
  });

  it("supports ZIPs with at least two collected nearby stores across two chains", async () => {
    app = Fastify();
    const db = fakePriceDb();
    await app.register(priceApiPlugin, {
      db,
      getCollector: (chain: ChainSlug) => {
        if (chain === "kroger") {
          return collectorFor(chain, {
            stores: [storeCandidate("kroger-1", "Kroger", "45202", 39.1, -84.5)],
          });
        }

        if (chain === "target") {
          return collectorFor(chain, {
            stores: [storeCandidate("target-1", "Target", "45202-1234", 39.11, -84.51)],
          });
        }

        return null;
      },
    });

    const response = await app.inject({ method: "GET", url: "/v1/coverage?zip=45202" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      supported: true,
      chains: ["kroger", "target"],
      storeCount: 2,
    });
  });

  it("does not support ZIPs covered by only one chain", async () => {
    app = Fastify();
    const db = fakePriceDb();
    await app.register(priceApiPlugin, {
      db,
      getCollector: (chain: ChainSlug) =>
        chain === "kroger"
          ? collectorFor(chain, {
              stores: [
                storeCandidate("kroger-1", "Kroger 1", "45202", 39.1, -84.5),
                storeCandidate("kroger-2", "Kroger 2", "45202", 39.11, -84.51),
              ],
            })
          : null,
    });

    const response = await app.inject({ method: "GET", url: "/v1/coverage?zip=45202" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      supported: false,
      chains: ["kroger"],
      storeCount: 2,
    });
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

  it("filters broad store candidates to the requested ZIP vicinity", async () => {
    app = Fastify();
    const db = fakePriceDb();
    await app.register(priceApiPlugin, {
      db,
      getCollector: (chain: ChainSlug) => {
        if (chain === "target") {
          return collectorFor(chain, {
            stores: [
              storeCandidate(
                "target-jersey-city",
                "Target Jersey City",
                "07310-1202",
                40.732336,
                -74.03572,
              ),
              storeCandidate("target-jsq", "Target JSQ", "07306-4240", 40.73116, -74.063601),
              storeCandidate(
                "target-north-bergen",
                "Target North Bergen",
                "07047-4507",
                40.801744,
                -74.021424,
              ),
            ],
          });
        }

        if (chain === "aldi") {
          return collectorFor(chain, {
            stores: [
              storeCandidate(
                "aldi-north-bergen",
                "ALDI North Bergen",
                "07047",
                40.7737339,
                -74.0371728,
              ),
              storeCandidate(
                "aldi-staten-island",
                "ALDI Staten Island",
                "10306",
                40.568999,
                -74.1090388,
              ),
            ],
          });
        }

        return null;
      },
    });

    const response = await app.inject({ method: "GET", url: "/stores?zip=07310" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.stores.map((store: { name: string }) => store.name)).toEqual([
      "Target Jersey City",
      "ALDI North Bergen",
    ]);
    expect(body.stores[0].distanceMiles).toBeCloseTo(0, 1);
    expect(body.stores[1].distanceMiles).toBeLessThan(4);
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

  it("serves cached product prices without inserting snapshots", async () => {
    const now = new Date("2026-07-04T12:00:00Z");
    const productId = "00000000-0000-4000-8000-000000000001";
    const storeId = "10000000-0000-4000-8000-000000000001";
    const externalProductId = "external-product-1";
    const db = fakeProductPricesDb({
      productId,
      storeId,
      externalProductId,
      cachedProducts: [
        {
          externalProductId,
          name: "Cached Milk",
          brand: "Store",
          sizeRaw: "1 gal",
          upc: null,
          category: "dairy",
          imageUrl: null,
          price: 3.49,
          promoPrice: null,
          capturedAt: new Date("2026-07-04T11:55:00Z"),
        },
      ],
      now,
    });
    app = Fastify();
    await app.register(priceApiPlugin, {
      db,
      getCollector: () => throwingCollector("kroger"),
      cache: createCache(db, () => now),
    });

    const response = await app.inject({
      method: "GET",
      url: `/products/${productId}/prices?storeIds=${storeId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().prices).toEqual([
      {
        storeId,
        productId,
        price: 3.49,
        promoPrice: null,
        capturedAt: "2026-07-04T11:55:00.000Z",
        source: "kroger",
      },
    ]);
    expect(db.snapshotInserts).toBe(0);
  });

  it("filters off-intent retailer products from search before matching", async () => {
    const storeId = "10000000-0000-4000-8000-000000000001";
    const db = fakeSearchDb(storeId);
    app = Fastify();
    await app.register(priceApiPlugin, {
      db,
      getCollector: (chain: ChainSlug) =>
        chain === "kroger"
          ? collectorFor(chain, {
              products: [
                collectedProduct({ externalProductId: "eggs-1", name: "Grade A Large Eggs" }),
                collectedProduct({ externalProductId: "whites-1", name: "Liquid Egg Whites" }),
                collectedProduct({ externalProductId: "bacon-1", name: "Premium Sliced Bacon" }),
                collectedProduct({ externalProductId: "noodles-1", name: "Wide Egg Noodles" }),
              ],
            })
          : null,
    });

    const response = await app.inject({
      method: "GET",
      url: `/search?q=eggs&storeIds=${storeId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.results.map((result: { product: { name: string } }) => result.product.name)).toEqual(
      ["Grade A Large Eggs", "Liquid Egg Whites"],
    );
    expect(body.results.map((result: { match: unknown }) => result.match)).toEqual([
      { confidence: "new", methods: ["inserted"] },
      { confidence: "new", methods: ["inserted"] },
    ]);
    expect(db.insertedProductNames).toEqual(["Grade A Large Eggs", "Liquid Egg Whites"]);
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
    products?: CollectedProduct[];
    stores?: CollectedStore[];
  },
): Collector {
  return {
    chain,
    async findStores() {
      return data.stores ?? [];
    },
    async searchProducts() {
      return data.products ?? [];
    },
    async getPrices() {
      return [];
    },
  };
}

function storeCandidate(
  externalLocationId: string,
  name: string,
  zip: string,
  lat: number,
  lng: number,
): CollectedStore {
  return {
    externalLocationId,
    name,
    address: `${name} Address`,
    zip,
    lat,
    lng,
  };
}

function collectedProduct(overrides: Partial<CollectedProduct> = {}): CollectedProduct {
  return {
    externalProductId: "external-product-1",
    name: "Product",
    brand: "Store",
    sizeRaw: "12 ct",
    upc: null,
    category: null,
    imageUrl: null,
    price: 2.99,
    promoPrice: null,
    capturedAt: new Date("2026-07-04T12:00:00Z"),
    ...overrides,
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

function fakeProductPricesDb(input: {
  productId: string;
  storeId: string;
  externalProductId: string;
  cachedProducts: CollectedProduct[];
  now: Date;
}): CartwiseDb & CacheDb & { snapshotInserts: number } {
  const store = {
    id: input.storeId,
    chainSlug: "kroger" as const,
    externalLocationId: "external-store-1",
    name: "Kroger",
    address: "1 Main St",
    zip: "45202",
    lat: 39.1,
    lng: -84.5,
  };
  const product = {
    id: input.productId,
    name: "Milk",
    brand: "Store",
    sizeQty: 1,
    sizeUnit: "gal",
    upc: null,
    category: "dairy",
    imageUrl: null,
  };
  const cacheKey = `price:kroger:${store.externalLocationId}:${input.externalProductId}`;
  const cacheEntries = new Map<string, CacheEntry>([
    [
      cacheKey,
      {
        key: cacheKey,
        payload: { v: input.cachedProducts, storedAt: input.now.toISOString() },
        expiresAt: new Date(input.now.getTime() + 60_000),
      },
    ],
  ]);

  const target = {
    snapshotInserts: 0,
    async getCacheEntry(key: string) {
      return cacheEntries.get(key) ?? null;
    },
    async setCacheEntry(key: string, payload: unknown, expiresAt: Date) {
      cacheEntries.set(key, { key, payload, expiresAt });
    },
    async getProductById(id: string) {
      return id === product.id ? product : null;
    },
    async getStoreProductsForProduct(productId: string, storeIds: string[]) {
      if (productId !== product.id || !storeIds.includes(store.id)) {
        return [];
      }

      return [
        {
          id: "store-product-1",
          productId: product.id,
          storeId: store.id,
          externalProductId: input.externalProductId,
          store,
        },
      ];
    },
    async insertPriceSnapshot() {
      this.snapshotInserts += 1;
      throw new Error("Snapshot insert should not be called on a cache hit");
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

  return proxied as unknown as CartwiseDb & CacheDb & { snapshotInserts: number };
}

function fakeSearchDb(storeId: string): CartwiseDb & CacheDb & { insertedProductNames: string[] } {
  const cacheEntries = new Map<string, CacheEntry>();
  const insertedProductNames: string[] = [];
  const products = new Map<string, {
    id: string;
    name: string;
    brand: string | null;
    sizeQty: number | null;
    sizeUnit: string | null;
    upc: string | null;
    category: string | null;
    imageUrl: string | null;
  }>();
  const store = {
    id: storeId,
    chainSlug: "kroger" as const,
    externalLocationId: "external-store-1",
    name: "Kroger",
    address: "1 Main St",
    zip: "45202",
    lat: 39.1,
    lng: -84.5,
  };

  const target = {
    insertedProductNames,
    async getCacheEntry(key: string) {
      return cacheEntries.get(key) ?? null;
    },
    async setCacheEntry(key: string, payload: unknown, expiresAt: Date) {
      cacheEntries.set(key, { key, payload, expiresAt });
    },
    async getStoresByIds(ids: string[]) {
      return ids.includes(store.id) ? [store] : [];
    },
    async findProductByUpc() {
      return null;
    },
    async findProductByIdentity() {
      return null;
    },
    async insertProduct(input: {
      name: string;
      brand: string | null;
      sizeQty: number | null;
      sizeUnit: string | null;
      upc: string | null;
      category: string | null;
      imageUrl: string | null;
    }) {
      insertedProductNames.push(input.name);
      const product = {
        id: `00000000-0000-4000-8000-${String(products.size + 1).padStart(12, "0")}`,
        ...input,
      };
      products.set(product.id, product);
      return product;
    },
    async upsertStoreProduct(productId: string, productStoreId: string, externalProductId: string) {
      return {
        id: `store-product-${externalProductId}`,
        productId,
        storeId: productStoreId,
        externalProductId,
      };
    },
    async insertPriceSnapshot(input: {
      storeProductId: string;
      price: number;
      promoPrice: number | null;
      capturedAt: Date;
      source: ChainSlug;
    }) {
      return { id: `price-${input.storeProductId}`, ...input };
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

  return proxied as unknown as CartwiseDb & CacheDb & { insertedProductNames: string[] };
}
