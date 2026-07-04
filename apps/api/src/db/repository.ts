import type { ChainSlug } from "@cartwise/shared";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import type { CollectedStore } from "../collectors/types.js";
import { db as drizzleDb } from "./client.js";
import { cartItems, carts, priceCache, priceSnapshots, products, storeProducts, stores } from "./schema.js";

export interface CacheEntry {
  key: string;
  payload: unknown;
  expiresAt: Date;
}

export interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  sizeQty: number | null;
  sizeUnit: string | null;
  upc: string | null;
  category: string | null;
  imageUrl: string | null;
}

export interface StoreRow {
  id: string;
  chainSlug: ChainSlug;
  externalLocationId: string;
  name: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
}

export interface StoreProductRow {
  id: string;
  productId: string;
  storeId: string;
  externalProductId: string;
}

export interface StoreProductWithStore extends StoreProductRow {
  store: StoreRow;
}

export interface PriceSnapshotRow {
  id: string;
  storeProductId: string;
  price: number;
  promoPrice: number | null;
  capturedAt: Date;
  source: ChainSlug;
}

export interface CartRow {
  id: string;
  deviceId: string;
  status: "active" | "finalized";
  createdAt: Date;
}

export interface CartItemRow {
  id: string;
  cartId: string;
  productId: string;
  qty: number;
}

export interface CartItemWithProduct extends CartItemRow {
  product: ProductRow;
}

export interface CartWithItems {
  cart: CartRow;
  items: CartItemWithProduct[];
}

export interface LatestProductStorePriceRow {
  productId: string;
  storeId: string;
  storeProductId: string;
  externalProductId: string;
  store: StoreRow;
  price: PriceSnapshotRow | null;
}

export interface InsertProductInput {
  name: string;
  brand: string | null;
  sizeQty: number | null;
  sizeUnit: string | null;
  upc: string | null;
  category: string | null;
  imageUrl: string | null;
}

export interface FindProductIdentity {
  name: string;
  brand: string | null;
  sizeQty: number | null;
  sizeUnit: string | null;
}

export interface InsertPriceSnapshotInput {
  storeProductId: string;
  price: number;
  promoPrice: number | null;
  capturedAt: Date;
  source: ChainSlug;
}

export interface CartwiseDb {
  getCacheEntry(key: string): Promise<CacheEntry | null>;
  setCacheEntry(key: string, payload: unknown, expiresAt: Date): Promise<void>;
  upsertStore(chain: ChainSlug, store: CollectedStore): Promise<StoreRow>;
  getStoresByIds(ids: string[]): Promise<StoreRow[]>;
  getProductById(id: string): Promise<ProductRow | null>;
  findProductByUpc(upc: string): Promise<ProductRow | null>;
  findProductByIdentity(identity: FindProductIdentity): Promise<ProductRow | null>;
  insertProduct(input: InsertProductInput): Promise<ProductRow>;
  upsertStoreProduct(
    productId: string,
    storeId: string,
    externalProductId: string,
  ): Promise<StoreProductRow>;
  insertPriceSnapshot(input: InsertPriceSnapshotInput): Promise<PriceSnapshotRow>;
  getStoreProductsForProduct(
    productId: string,
    storeIds: string[],
  ): Promise<StoreProductWithStore[]>;
  getOrCreateActiveCart(deviceId: string): Promise<CartRow>;
  getActiveCartWithItems(deviceId: string): Promise<CartWithItems | null>;
  upsertCartItem(cartId: string, productId: string, qty: number): Promise<CartItemRow>;
  removeCartItem(cartId: string, productId: string): Promise<void>;
  finalizeCart(cartId: string): Promise<void>;
  getLatestPricesForProducts(
    productIds: string[],
    storeIds: string[],
  ): Promise<LatestProductStorePriceRow[]>;
  getAlternativeProductsByCategory(
    category: string,
    excludeProductId: string,
    storeIds: string[],
    limit: number,
  ): Promise<ProductRow[]>;
}

class DrizzleCartwiseDb implements CartwiseDb {
  async getCacheEntry(key: string): Promise<CacheEntry | null> {
    const [entry] = await drizzleDb.select().from(priceCache).where(eq(priceCache.key, key)).limit(1);
    return entry ?? null;
  }

  async setCacheEntry(key: string, payload: unknown, expiresAt: Date): Promise<void> {
    await drizzleDb
      .insert(priceCache)
      .values({ key, payload, expiresAt })
      .onConflictDoUpdate({
        target: priceCache.key,
        set: { payload, expiresAt },
      });
  }

  async upsertStore(chain: ChainSlug, store: CollectedStore): Promise<StoreRow> {
    const [row] = await drizzleDb
      .insert(stores)
      .values({
        chainSlug: chain,
        externalLocationId: store.externalLocationId,
        name: store.name,
        address: store.address,
        zip: store.zip,
        lat: store.lat,
        lng: store.lng,
      })
      .onConflictDoUpdate({
        target: [stores.chainSlug, stores.externalLocationId],
        set: {
          name: store.name,
          address: store.address,
          zip: store.zip,
          lat: store.lat,
          lng: store.lng,
        },
      })
      .returning();

    return row as StoreRow;
  }

  async getStoresByIds(ids: string[]): Promise<StoreRow[]> {
    if (ids.length === 0) {
      return [];
    }

    return (await drizzleDb.select().from(stores).where(inArray(stores.id, ids))) as StoreRow[];
  }

  async getProductById(id: string): Promise<ProductRow | null> {
    const [row] = await drizzleDb.select().from(products).where(eq(products.id, id)).limit(1);
    return (row as ProductRow | undefined) ?? null;
  }

  async findProductByUpc(upc: string): Promise<ProductRow | null> {
    const [row] = await drizzleDb.select().from(products).where(eq(products.upc, upc)).limit(1);
    return (row as ProductRow | undefined) ?? null;
  }

  async findProductByIdentity(identity: FindProductIdentity): Promise<ProductRow | null> {
    const conditions = [
      sql`lower(trim(${products.name})) = ${normalizeIdentity(identity.name)}`,
      identity.brand === null
        ? isNull(products.brand)
        : sql`lower(trim(${products.brand})) = ${normalizeIdentity(identity.brand)}`,
      identity.sizeQty === null ? isNull(products.sizeQty) : eq(products.sizeQty, identity.sizeQty),
      identity.sizeUnit === null ? isNull(products.sizeUnit) : eq(products.sizeUnit, identity.sizeUnit),
    ];

    const [row] = await drizzleDb
      .select()
      .from(products)
      .where(and(...conditions))
      .limit(1);

    return (row as ProductRow | undefined) ?? null;
  }

  async insertProduct(input: InsertProductInput): Promise<ProductRow> {
    const [row] = await drizzleDb.insert(products).values(input).returning();
    return row as ProductRow;
  }

  async upsertStoreProduct(
    productId: string,
    storeId: string,
    externalProductId: string,
  ): Promise<StoreProductRow> {
    const [row] = await drizzleDb
      .insert(storeProducts)
      .values({ productId, storeId, externalProductId })
      .onConflictDoUpdate({
        target: [storeProducts.storeId, storeProducts.externalProductId],
        set: { productId },
      })
      .returning();

    return row as StoreProductRow;
  }

  async insertPriceSnapshot(input: InsertPriceSnapshotInput): Promise<PriceSnapshotRow> {
    const [row] = await drizzleDb.insert(priceSnapshots).values(input).returning();
    return row as PriceSnapshotRow;
  }

  async getStoreProductsForProduct(
    productId: string,
    storeIds: string[],
  ): Promise<StoreProductWithStore[]> {
    if (storeIds.length === 0) {
      return [];
    }

    const rows = await drizzleDb
      .select({
        id: storeProducts.id,
        productId: storeProducts.productId,
        storeId: storeProducts.storeId,
        externalProductId: storeProducts.externalProductId,
        store: stores,
      })
      .from(storeProducts)
      .innerJoin(stores, eq(stores.id, storeProducts.storeId))
      .where(and(eq(storeProducts.productId, productId), inArray(storeProducts.storeId, storeIds)));

    return rows as StoreProductWithStore[];
  }

  async getOrCreateActiveCart(deviceId: string): Promise<CartRow> {
    const existing = await this.getActiveCart(deviceId);
    if (existing) {
      return existing;
    }

    const [row] = await drizzleDb.insert(carts).values({ deviceId }).returning();
    return row as CartRow;
  }

  async getActiveCartWithItems(deviceId: string): Promise<CartWithItems | null> {
    const cart = await this.getActiveCart(deviceId);
    if (!cart) {
      return null;
    }

    const rows = await drizzleDb
      .select({
        id: cartItems.id,
        cartId: cartItems.cartId,
        productId: cartItems.productId,
        qty: cartItems.qty,
        product: products,
      })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(eq(cartItems.cartId, cart.id));

    return {
      cart,
      items: rows as CartItemWithProduct[],
    };
  }

  async upsertCartItem(cartId: string, productId: string, qty: number): Promise<CartItemRow> {
    const [row] = await drizzleDb
      .insert(cartItems)
      .values({ cartId, productId, qty })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.productId],
        set: { qty },
      })
      .returning();

    return row as CartItemRow;
  }

  async removeCartItem(cartId: string, productId: string): Promise<void> {
    await drizzleDb
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));
  }

  async finalizeCart(cartId: string): Promise<void> {
    await drizzleDb.update(carts).set({ status: "finalized" }).where(eq(carts.id, cartId));
  }

  async getLatestPricesForProducts(
    productIds: string[],
    storeIds: string[],
  ): Promise<LatestProductStorePriceRow[]> {
    if (productIds.length === 0 || storeIds.length === 0) {
      return [];
    }

    const rows = await drizzleDb
      .select({
        productId: storeProducts.productId,
        storeId: storeProducts.storeId,
        storeProductId: storeProducts.id,
        externalProductId: storeProducts.externalProductId,
        store: stores,
        priceId: priceSnapshots.id,
        priceStoreProductId: priceSnapshots.storeProductId,
        price: priceSnapshots.price,
        promoPrice: priceSnapshots.promoPrice,
        capturedAt: priceSnapshots.capturedAt,
        source: priceSnapshots.source,
      })
      .from(storeProducts)
      .innerJoin(stores, eq(stores.id, storeProducts.storeId))
      .leftJoin(priceSnapshots, eq(priceSnapshots.storeProductId, storeProducts.id))
      .where(and(inArray(storeProducts.productId, productIds), inArray(storeProducts.storeId, storeIds)))
      .orderBy(storeProducts.productId, storeProducts.storeId, desc(priceSnapshots.capturedAt));

    const latest = new Map<string, LatestProductStorePriceRow>();

    for (const row of rows) {
      const key = `${row.productId}:${row.storeId}`;
      if (latest.has(key)) {
        continue;
      }

      latest.set(key, {
        productId: row.productId,
        storeId: row.storeId,
        storeProductId: row.storeProductId,
        externalProductId: row.externalProductId,
        store: row.store as StoreRow,
        price: row.priceId
          ? {
              id: row.priceId,
              storeProductId: row.priceStoreProductId ?? row.storeProductId,
              price: row.price ?? 0,
              promoPrice: row.promoPrice,
              capturedAt: row.capturedAt ?? new Date(0),
              source: row.source as ChainSlug,
            }
          : null,
      });
    }

    return Array.from(latest.values());
  }

  async getAlternativeProductsByCategory(
    category: string,
    excludeProductId: string,
    storeIds: string[],
    limit: number,
  ): Promise<ProductRow[]> {
    if (storeIds.length === 0 || limit <= 0) {
      return [];
    }

    const rows = await drizzleDb
      .select({ product: products })
      .from(products)
      .innerJoin(storeProducts, eq(storeProducts.productId, products.id))
      .innerJoin(priceSnapshots, eq(priceSnapshots.storeProductId, storeProducts.id))
      .where(
        and(
          eq(products.category, category),
          ne(products.id, excludeProductId),
          inArray(storeProducts.storeId, storeIds),
        ),
      )
      .limit(limit * Math.max(storeIds.length, 1) * 4);

    const deduped = new Map<string, ProductRow>();
    for (const row of rows) {
      if (deduped.size >= limit) {
        break;
      }

      deduped.set(row.product.id, row.product as ProductRow);
    }

    return Array.from(deduped.values());
  }

  private async getActiveCart(deviceId: string): Promise<CartRow | null> {
    const [row] = await drizzleDb
      .select()
      .from(carts)
      .where(and(eq(carts.deviceId, deviceId), eq(carts.status, "active")))
      .orderBy(desc(carts.createdAt))
      .limit(1);

    return (row as CartRow | undefined) ?? null;
  }
}

export const cartwiseDb: CartwiseDb = new DrizzleCartwiseDb();

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}
