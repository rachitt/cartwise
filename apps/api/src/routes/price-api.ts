import type { ChainSlug, Product, Store, StorePrice } from "@cartwise/shared";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";

import { createCache, type Cache } from "../cache.js";
import { upsertCollectedProduct } from "../catalog/matcher.js";
import type { CollectedProduct } from "../collectors/types.js";
import type { CartwiseDb, ProductRow } from "../db/repository.js";

const CHAINS: ChainSlug[] = ["kroger", "target", "walmart", "aldi"];
const STORES_TTL_SECONDS = 24 * 60 * 60;
const PRODUCTS_TTL_SECONDS = 6 * 60 * 60;

const storesQuerySchema = z.object({
  zip: z.string().regex(/^\d{5}$/),
});

const storeIdsSchema = z.string().transform((value, context) => {
  const storeIds = value
    .split(",")
    .map((storeId) => storeId.trim())
    .filter(Boolean);

  if (storeIds.length === 0 || storeIds.length > 8) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "storeIds must include 1-8 UUIDs",
    });
    return z.NEVER;
  }

  const uuid = z.string().uuid();
  for (const storeId of storeIds) {
    if (!uuid.safeParse(storeId).success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "storeIds must be comma-separated UUIDs",
      });
      return z.NEVER;
    }
  }

  return storeIds;
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  storeIds: storeIdsSchema,
});

const productParamsSchema = z.object({
  id: z.string().uuid(),
});

const productPricesQuerySchema = z.object({
  storeIds: storeIdsSchema,
});

export interface PriceApiDeps {
  db: CartwiseDb;
  getCollector(chain: ChainSlug): import("../collectors/types.js").Collector | null;
  cache?: Cache;
}

export const priceApiPlugin: FastifyPluginAsync<PriceApiDeps> = async (app, deps) => {
  const cache = deps.cache ?? createCache(deps.db);

  app.get("/stores", async (request, reply) => {
    const query = parseOr400(storesQuerySchema, request.query, reply);
    if (!query) {
      return reply;
    }

    const stores: Store[] = [];

    for (const chain of CHAINS) {
      const collector = deps.getCollector(chain);
      if (!collector) {
        continue;
      }

      const collectedStores = await cache.withCache(
        `stores:${chain}:${query.zip}`,
        STORES_TTL_SECONDS,
        () => collector.findStores(query.zip),
      );

      for (const collectedStore of collectedStores) {
        const row = await deps.db.upsertStore(chain, collectedStore);
        stores.push(toStore(row));
      }
    }

    return { stores };
  });

  app.get("/search", async (request, reply) => {
    const query = parseOr400(searchQuerySchema, request.query, reply);
    if (!query) {
      return reply;
    }

    const stores = await deps.db.getStoresByIds(query.storeIds);
    const groupedResults = new Map<string, { product: Product; prices: StorePrice[] }>();
    const normalizedQuery = normalizeSearchQuery(query.q);

    for (const store of stores) {
      const collector = deps.getCollector(store.chainSlug);
      if (!collector) {
        continue;
      }

      const collectedProducts = await cache.withCache(
        `search:${store.chainSlug}:${store.externalLocationId}:${normalizedQuery}`,
        PRODUCTS_TTL_SECONDS,
        () => collector.searchProducts(query.q, store.externalLocationId),
      );

      for (const collectedProduct of collectedProducts.map(normalizeCollectedProductDates)) {
        const matched = await upsertCollectedProduct(
          deps.db,
          collectedProduct,
          store.id,
          store.chainSlug,
        );
        const existing = groupedResults.get(matched.product.id) ?? {
          product: toProduct(matched.product),
          prices: [],
        };

        if (matched.price) {
          existing.prices.push(matched.price);
        }

        groupedResults.set(matched.product.id, existing);
      }
    }

    const results = Array.from(groupedResults.values()).map((result) => ({
      product: result.product,
      prices: sortPrices(result.prices),
    }));

    return { results };
  });

  app.get("/products/:id/prices", async (request, reply) => {
    const params = parseOr400(productParamsSchema, request.params, reply);
    const query = parseOr400(productPricesQuerySchema, request.query, reply);
    if (!params || !query) {
      return reply;
    }

    const product = await deps.db.getProductById(params.id);
    if (!product) {
      return reply.code(404).send({ error: "Product not found" });
    }

    const mappings = await deps.db.getStoreProductsForProduct(product.id, query.storeIds);
    const prices: StorePrice[] = [];

    for (const mapping of mappings) {
      const collector = deps.getCollector(mapping.store.chainSlug);
      if (!collector) {
        continue;
      }

      const collectedPrices = await cache.withCache(
        `price:${mapping.store.chainSlug}:${mapping.store.externalLocationId}:${mapping.externalProductId}`,
        PRODUCTS_TTL_SECONDS,
        () => collector.getPrices([mapping.externalProductId], mapping.store.externalLocationId),
      );

      for (const collectedProduct of collectedPrices.map(normalizeCollectedProductDates)) {
        if (
          collectedProduct.externalProductId !== mapping.externalProductId ||
          collectedProduct.price === null
        ) {
          continue;
        }

        const capturedAt = collectedProduct.capturedAt;
        await deps.db.insertPriceSnapshot({
          storeProductId: mapping.id,
          price: collectedProduct.price,
          promoPrice: collectedProduct.promoPrice,
          capturedAt,
          source: mapping.store.chainSlug,
        });
        prices.push({
          storeId: mapping.storeId,
          productId: product.id,
          price: collectedProduct.price,
          promoPrice: collectedProduct.promoPrice,
          capturedAt: capturedAt.toISOString(),
          source: mapping.store.chainSlug,
        });
      }
    }

    return { product: toProduct(product), prices: sortPrices(prices) };
  });
};

function parseOr400<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
  reply: FastifyReply,
): z.output<T> | null {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  reply.code(400).send({ error: "Invalid request", issues: result.error.issues });
  return null;
}

function toStore(store: {
  id: string;
  chainSlug: ChainSlug;
  name: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
}): Store {
  return {
    id: store.id,
    chain: store.chainSlug,
    name: store.name,
    address: store.address,
    zip: store.zip,
    lat: store.lat,
    lng: store.lng,
  };
}

function toProduct(product: ProductRow): Product {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    sizeQty: product.sizeQty,
    sizeUnit: product.sizeUnit,
    upc: product.upc,
    category: product.category,
    imageUrl: product.imageUrl,
  };
}

function sortPrices(prices: StorePrice[]): StorePrice[] {
  return [...prices].sort((left, right) => effectivePrice(left) - effectivePrice(right));
}

function effectivePrice(price: StorePrice): number {
  return price.promoPrice ?? price.price;
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCollectedProductDates(collected: CollectedProduct): CollectedProduct {
  return {
    ...collected,
    capturedAt:
      collected.capturedAt instanceof Date ? collected.capturedAt : new Date(collected.capturedAt),
  };
}
