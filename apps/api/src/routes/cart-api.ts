import type { ChainSlug, Product, Store, StorePrice } from "@cartwise/shared";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";

import { createCache, type Cache } from "../cache.js";
import type { CollectedProduct, Collector } from "../collectors/types.js";
import type {
  CartItemWithProduct,
  CartwiseDb,
  LatestProductStorePriceRow,
  ProductRow,
  StoreRow,
} from "../db/repository.js";
import { OptimizerError, optimizeCart, type OptimizerInput } from "../optimizer/optimize.js";
import { upsertWatchesForFinalizedCart } from "../watch-service.js";

const PRODUCTS_TTL_SECONDS = 6 * 60 * 60;
const STALE_PRICE_MS = 6 * 60 * 60 * 1_000;

const deviceIdHeaderSchema = z.string().trim().min(1).max(64);
const itemBodySchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(0).max(999),
});
const finalizeBodySchema = z.object({
  storeIds: z.array(z.string().uuid()).min(1).max(8),
});

export interface CartApiDeps {
  db: CartwiseDb;
  getCollector(chain: ChainSlug): Collector | null;
  cache?: Cache;
  now?: () => Date;
}

export const cartApiPlugin: FastifyPluginAsync<CartApiDeps> = async (app, deps) => {
  const cache = deps.cache ?? createCache(deps.db);
  const now = deps.now ?? (() => new Date());

  app.post("/carts", async (request, reply) => {
    const deviceId = parseDeviceId(request.headers["x-device-id"], reply);
    if (!deviceId) {
      return reply;
    }

    const cart = await deps.db.getOrCreateActiveCart(deviceId);
    const current = await deps.db.getActiveCartWithItems(deviceId);
    return { cart: toCartResponse(current ?? { cart, items: [] }) };
  });

  app.get("/carts/current", async (request, reply) => {
    const deviceId = parseDeviceId(request.headers["x-device-id"], reply);
    if (!deviceId) {
      return reply;
    }

    const cart = await deps.db.getOrCreateActiveCart(deviceId);
    const current = await deps.db.getActiveCartWithItems(deviceId);
    return { cart: toCartResponse(current ?? { cart, items: [] }) };
  });

  app.put("/carts/current/items", async (request, reply) => {
    const deviceId = parseDeviceId(request.headers["x-device-id"], reply);
    const body = parseOr400(itemBodySchema, request.body, reply);
    if (!deviceId || !body) {
      return reply;
    }

    const product = await deps.db.getProductById(body.productId);
    if (!product) {
      return reply.code(400).send({ error: "Product not found" });
    }

    const cart = await deps.db.getOrCreateActiveCart(deviceId);
    if (body.qty === 0) {
      await deps.db.removeCartItem(cart.id, body.productId);
    } else {
      await deps.db.upsertCartItem(cart.id, body.productId, body.qty);
    }

    const current = await deps.db.getActiveCartWithItems(deviceId);
    return { cart: toCartResponse(current ?? { cart, items: [] }) };
  });

  app.post("/carts/current/finalize", async (request, reply) => {
    const deviceId = parseDeviceId(request.headers["x-device-id"], reply);
    const body = parseOr400(finalizeBodySchema, request.body, reply);
    if (!deviceId || !body) {
      return reply;
    }

    const cart = await deps.db.getActiveCartWithItems(deviceId);
    if (!cart || cart.items.length === 0) {
      return reply.code(400).send({ error: "Cart is empty" });
    }

    const stores = await deps.db.getStoresByIds(body.storeIds);
    const productIds = cart.items.map((item) => item.productId);
    let latestRows = await deps.db.getLatestPricesForProducts(productIds, body.storeIds);

    await refreshStalePrices(deps.db, deps.getCollector, cache, latestRows, now());
    latestRows = await deps.db.getLatestPricesForProducts(productIds, body.storeIds);

    const cartPrices = latestRowsToStorePrices(latestRows);
    const alternatives = await buildAlternatives(deps.db, cart.items, body.storeIds);

    try {
      const optimization = optimizeCart({
        items: cart.items.map((item) => ({ productId: item.productId, qty: item.qty })),
        prices: cartPrices,
        stores: stores.map(toStore),
        alternatives,
      });

      await deps.db.finalizeCart(cart.cart.id);
      await upsertWatchesForFinalizedCart(
        deps.db,
        deviceId,
        cart.items,
        body.storeIds,
        latestRows,
        optimization.winningStoreId,
      );
      return optimization;
    } catch (error) {
      if (error instanceof OptimizerError) {
        return reply.code(400).send({ error: error.message });
      }

      throw error;
    }
  });
};

async function refreshStalePrices(
  db: CartwiseDb,
  getCollector: (chain: ChainSlug) => Collector | null,
  cache: Cache,
  rows: LatestProductStorePriceRow[],
  now: Date,
): Promise<void> {
  for (const row of rows) {
    if (row.price && now.getTime() - row.price.capturedAt.getTime() < STALE_PRICE_MS) {
      continue;
    }

    const collector = getCollector(row.store.chainSlug);
    if (!collector) {
      continue;
    }

    try {
      const collectedProducts = await cache.withCache(
        `price:${row.store.chainSlug}:${row.store.externalLocationId}:${row.externalProductId}`,
        PRODUCTS_TTL_SECONDS,
        () => collector.getPrices([row.externalProductId], row.store.externalLocationId),
      );

      const collected = collectedProducts
        .map(normalizeCollectedProductDates)
        .find((product) => product.externalProductId === row.externalProductId);

      if (!collected || collected.price === null) {
        continue;
      }

      await db.insertPriceSnapshot({
        storeProductId: row.storeProductId,
        price: collected.price,
        promoPrice: collected.promoPrice,
        capturedAt: collected.capturedAt,
        source: row.store.chainSlug,
      });
    } catch {
      continue;
    }
  }
}

async function buildAlternatives(
  db: CartwiseDb,
  items: CartItemWithProduct[],
  storeIds: string[],
): Promise<OptimizerInput["alternatives"]> {
  const alternatives: OptimizerInput["alternatives"] = {};

  for (const item of items) {
    const candidates =
      item.product.category === null
        ? []
        : await db.getAlternativeProductsByCategory(item.product.category, item.productId, storeIds, 5);
    const products = [item.product, ...candidates];
    const priceRows = await db.getLatestPricesForProducts(
      products.map((product) => product.id),
      storeIds,
    );
    const pricesByProduct = groupPricesByProduct(latestRowsToStorePrices(priceRows));

    alternatives[item.productId] = products
      .map((product) => ({
        product: toProduct(product),
        prices: pricesByProduct.get(product.id) ?? [],
      }))
      .filter((alternative) => alternative.product.id === item.productId || alternative.prices.length > 0);
  }

  return alternatives;
}

function groupPricesByProduct(prices: StorePrice[]): Map<string, StorePrice[]> {
  const grouped = new Map<string, StorePrice[]>();

  for (const price of prices) {
    const existing = grouped.get(price.productId) ?? [];
    existing.push(price);
    grouped.set(price.productId, existing);
  }

  return grouped;
}

function latestRowsToStorePrices(rows: LatestProductStorePriceRow[]): StorePrice[] {
  return rows.flatMap((row) =>
    row.price
      ? [
          {
            productId: row.productId,
            storeId: row.storeId,
            price: row.price.price,
            promoPrice: row.price.promoPrice,
            capturedAt: row.price.capturedAt.toISOString(),
            source: row.price.source,
          },
        ]
      : [],
  );
}

function parseDeviceId(value: string | string[] | undefined, reply: FastifyReply): string | null {
  const parsed = deviceIdHeaderSchema.safeParse(Array.isArray(value) ? value[0] : value);
  if (parsed.success) {
    return parsed.data;
  }

  reply.code(400).send({ error: "Missing or invalid x-device-id header" });
  return null;
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

function toCartResponse(cart: { cart: { id: string; status: string; createdAt: Date }; items: CartItemWithProduct[] }) {
  return {
    id: cart.cart.id,
    status: cart.cart.status,
    createdAt: cart.cart.createdAt.toISOString(),
    items: cart.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      qty: item.qty,
      product: toProduct(item.product),
    })),
  };
}

function toStore(store: StoreRow): Store {
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

function normalizeCollectedProductDates(collected: CollectedProduct): CollectedProduct {
  return {
    ...collected,
    capturedAt:
      collected.capturedAt instanceof Date ? collected.capturedAt : new Date(collected.capturedAt),
  };
}
