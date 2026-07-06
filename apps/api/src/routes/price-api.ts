import type { ChainSlug, Product, Store, StorePrice } from "@cartwise/shared";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";

import { createCache, type Cache, type CacheResult } from "../cache.js";
import { upsertCollectedProduct } from "../catalog/matcher.js";
import type { CollectedProduct, Collector } from "../collectors/types.js";
import type { CartwiseDb, ProductRow } from "../db/repository.js";
import { compareSearchableProducts, searchRelevanceScore } from "../search/relevance.js";

const CHAINS: ChainSlug[] = ["kroger", "target", "walmart", "aldi"];
const MAX_STORE_IDS = 40;
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

  if (storeIds.length === 0 || storeIds.length > MAX_STORE_IDS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `storeIds must include 1-${MAX_STORE_IDS} UUIDs`,
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
  getCollector(chain: ChainSlug): Collector | null;
  cache?: Cache;
}

type SourceStatus = "live" | "stale" | "error" | "unavailable";

interface ResponseSource {
  chain: ChainSlug;
  status: SourceStatus;
  capturedAt?: string;
}

interface SearchCacheItem {
  product: Product;
  price: StorePrice | null;
  relevanceScore: number;
}

export const priceApiPlugin: FastifyPluginAsync<PriceApiDeps> = async (app, deps) => {
  const cache = deps.cache ?? createCache(deps.db);

  app.get("/stores", async (request, reply) => {
    const query = parseOr400(storesQuerySchema, request.query, reply);
    if (!query) {
      return reply;
    }

    const stores: Store[] = [];
    const sources: ResponseSource[] = [];

    for (const chain of CHAINS) {
      const collector = deps.getCollector(chain);
      if (!collector) {
        sources.push({ chain, status: "unavailable" });
        continue;
      }

      const result = await collectWithSource(
        sources,
        chain,
        cache,
        `stores:${chain}:${query.zip}`,
        STORES_TTL_SECONDS,
        () => collector.findStores(query.zip),
      );
      if (!result) {
        continue;
      }

      for (const collectedStore of result.value) {
        const row = await deps.db.upsertStore(chain, collectedStore);
        stores.push(toStore(row));
      }
    }

    if (shouldReturnCollectorFailure(sources)) {
      return reply.code(503).send({ error: "Collectors unavailable", sources });
    }

    return { stores, sources };
  });

  app.get("/search", async (request, reply) => {
    const query = parseOr400(searchQuerySchema, request.query, reply);
    if (!query) {
      return reply;
    }

    const stores = await deps.db.getStoresByIds(query.storeIds);
    const groupedResults = new Map<
      string,
      { product: Product; prices: StorePrice[]; relevanceScore: number }
    >();
    const normalizedQuery = normalizeSearchQuery(query.q);
    const sources: ResponseSource[] = [];

    for (const store of stores) {
      const collector = deps.getCollector(store.chainSlug);
      if (!collector) {
        sources.push({ chain: store.chainSlug, status: "unavailable" });
        continue;
      }

      const result = await collectWithSource(
        sources,
        store.chainSlug,
        cache,
        `search:v3:${store.chainSlug}:${store.externalLocationId}:${normalizedQuery}`,
        PRODUCTS_TTL_SECONDS,
        async () => {
          const collectedProducts = (await collector.searchProducts(query.q, store.externalLocationId))
            .map(normalizeCollectedProductDates)
            .filter((product) => searchRelevanceScore(query.q, product) !== null)
            .sort((left, right) => compareSearchableProducts(query.q, left, right));
          const matchedProducts: SearchCacheItem[] = [];

          for (const collectedProduct of collectedProducts) {
            const relevanceScore = searchRelevanceScore(query.q, collectedProduct);
            if (relevanceScore === null) {
              continue;
            }

            const matched = await upsertCollectedProduct(
              deps.db,
              collectedProduct,
              store.id,
              store.chainSlug,
            );
            matchedProducts.push({
              product: toProduct(matched.product),
              price: matched.price,
              relevanceScore,
            });
          }

          return matchedProducts;
        },
      );
      if (!result) {
        continue;
      }

      for (const matched of result.value) {
        const relevanceScore =
          matched.relevanceScore ?? searchRelevanceScore(query.q, matched.product);
        if (relevanceScore === null) {
          continue;
        }

        const existing = groupedResults.get(matched.product.id) ?? {
          product: matched.product,
          prices: [],
          relevanceScore,
        };
        existing.relevanceScore = Math.max(existing.relevanceScore, relevanceScore);

        if (matched.price) {
          existing.prices.push(matched.price);
        }

        groupedResults.set(matched.product.id, existing);
      }
    }

    const results = Array.from(groupedResults.values())
      .map((result) => ({
        product: result.product,
        prices: sortPrices(result.prices),
        relevanceScore: result.relevanceScore,
      }))
      .filter((result) => result.prices.length > 0)
      .sort(
        (left, right) =>
          right.relevanceScore - left.relevanceScore ||
          right.prices.length - left.prices.length ||
          lowestEffectivePrice(left.prices) - lowestEffectivePrice(right.prices),
      )
      .map(({ relevanceScore: _relevanceScore, ...result }) => result);

    if (shouldReturnCollectorFailure(sources)) {
      return reply.code(503).send({ error: "Collectors unavailable", sources });
    }

    return { results, sources };
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
    const sources: ResponseSource[] = [];

    for (const mapping of mappings) {
      const collector = deps.getCollector(mapping.store.chainSlug);
      if (!collector) {
        sources.push({ chain: mapping.store.chainSlug, status: "unavailable" });
        continue;
      }

      const result = await collectWithSource(
        sources,
        mapping.store.chainSlug,
        cache,
        `price:${mapping.store.chainSlug}:${mapping.store.externalLocationId}:${mapping.externalProductId}`,
        PRODUCTS_TTL_SECONDS,
        async () => {
          const collectedProducts = (
            await collector.getPrices([mapping.externalProductId], mapping.store.externalLocationId)
          ).map(normalizeCollectedProductDates);

          for (const collectedProduct of collectedProducts) {
            if (
              collectedProduct.externalProductId !== mapping.externalProductId ||
              collectedProduct.price === null
            ) {
              continue;
            }

            await deps.db.insertPriceSnapshot({
              storeProductId: mapping.id,
              price: collectedProduct.price,
              promoPrice: collectedProduct.promoPrice,
              capturedAt: collectedProduct.capturedAt,
              source: mapping.store.chainSlug,
            });
          }

          return collectedProducts;
        },
      );
      if (!result) {
        continue;
      }

      for (const collectedProduct of result.value.map(normalizeCollectedProductDates)) {
        if (
          collectedProduct.externalProductId !== mapping.externalProductId ||
          collectedProduct.price === null
        ) {
          continue;
        }

        const capturedAt = collectedProduct.capturedAt;
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

    if (shouldReturnCollectorFailure(sources)) {
      return reply.code(503).send({ error: "Collectors unavailable", sources });
    }

    return { product: toProduct(product), prices: sortPrices(prices), sources };
  });
};

async function collectWithSource<T>(
  sources: ResponseSource[],
  chain: ChainSlug,
  cache: Cache,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<CacheResult<T> | null> {
  try {
    const result = cache.withCacheMeta
      ? await cache.withCacheMeta(key, ttlSeconds, fn)
      : { value: await cache.withCache(key, ttlSeconds, fn), fresh: true, capturedAt: new Date() };
    sources.push({
      chain,
      status: result.fresh ? "live" : "stale",
      capturedAt: result.capturedAt.toISOString(),
    });
    return result;
  } catch {
    sources.push({ chain, status: "error" });
    return null;
  }
}

function shouldReturnCollectorFailure(sources: ResponseSource[]): boolean {
  const configuredSources = sources.filter((source) => source.status !== "unavailable");
  return (
    configuredSources.length > 0 &&
    configuredSources.every((source) => source.status === "error")
  );
}

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

function lowestEffectivePrice(prices: StorePrice[]): number {
  if (prices.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(...prices.map(effectivePrice));
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
