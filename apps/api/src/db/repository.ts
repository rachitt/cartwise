import type { ChainSlug } from "@cartwise/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { CollectedStore } from "../collectors/types.js";
import { db as drizzleDb } from "./client.js";
import { priceCache, priceSnapshots, products, storeProducts, stores } from "./schema.js";

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
}

export const cartwiseDb: CartwiseDb = new DrizzleCartwiseDb();

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}
