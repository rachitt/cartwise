import type { ChainSlug } from "@cartwise/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type {
  CacheEntry,
  CartItemRow,
  CartItemWithProduct,
  CartRow,
  CartwiseDb,
  FindProductIdentity,
  AlertRow,
  AlertWithDetails,
  InsertPriceSnapshotInput,
  InsertProductInput,
  LatestProductStorePriceRow,
  PriceSnapshotRow,
  ProductRow,
  PushTokenRow,
  StoreProductRow,
  StoreProductWithStore,
  StoreRow,
  UpsertWatchInput,
  WatchRow,
  WatchWithProduct,
} from "../db/repository.js";
import { cartApiPlugin } from "./cart-api.js";

const deviceId = "test-device";
const milkId = "00000000-0000-4000-8000-000000000001";
const breadId = "00000000-0000-4000-8000-000000000002";
const storeOneId = "10000000-0000-4000-8000-000000000001";
const storeTwoId = "10000000-0000-4000-8000-000000000002";

describe("cartApiPlugin", () => {
  let app: ReturnType<typeof Fastify> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("creates and reuses one active cart per device", async () => {
    const db = new FakeCartDb();
    app = await buildTestApp(db);

    const first = await app.inject({
      method: "POST",
      url: "/carts",
      headers: { "x-device-id": deviceId },
    });
    const second = await app.inject({
      method: "POST",
      url: "/carts",
      headers: { "x-device-id": deviceId },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().cart.id).toBe(second.json().cart.id);
    expect(db.carts).toHaveLength(1);
  });

  it("upserts and removes items in the current cart", async () => {
    const db = new FakeCartDb();
    app = await buildTestApp(db);

    const upserted = await app.inject({
      method: "PUT",
      url: "/carts/current/items",
      headers: { "x-device-id": deviceId },
      payload: { productId: milkId, qty: 2 },
    });
    const removed = await app.inject({
      method: "PUT",
      url: "/carts/current/items",
      headers: { "x-device-id": deviceId },
      payload: { productId: milkId, qty: 0 },
    });

    expect(upserted.statusCode).toBe(200);
    expect(upserted.json().cart.items).toMatchObject([{ productId: milkId, qty: 2 }]);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().cart.items).toEqual([]);
  });

  it("finalizes a non-empty cart and returns optimization JSON", async () => {
    const db = new FakeCartDb();
    const cart = await db.getOrCreateActiveCart(deviceId);
    await db.upsertCartItem(cart.id, milkId, 1);
    await db.upsertCartItem(cart.id, breadId, 2);
    db.setPrice(milkId, storeOneId, 2);
    db.setPrice(breadId, storeOneId, 1);
    db.setPrice(milkId, storeTwoId, 3);
    db.setPrice(breadId, storeTwoId, 2);
    app = await buildTestApp(db);

    const response = await app.inject({
      method: "POST",
      url: "/carts/current/finalize",
      headers: { "x-device-id": deviceId },
      payload: { storeIds: [storeOneId, storeTwoId] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      winningStoreId: storeOneId,
      winningTotal: 4,
      worstTotal: 7,
      savings: 3,
    });
    expect(body.perStoreTotals[0]).toMatchObject({
      storeId: storeOneId,
      total: 4,
      missingItems: [],
      coveredItemCount: 2,
      itemCount: 2,
      substitutionCount: 0,
      pricesAsOf: "2026-07-04T12:00:00.000Z",
      lines: [
        {
          productId: milkId,
          qty: 1,
          unitPrice: 2,
          lineTotal: 2,
          capturedAt: "2026-07-04T12:00:00.000Z",
        },
        {
          productId: breadId,
          qty: 2,
          unitPrice: 1,
          lineTotal: 2,
          capturedAt: "2026-07-04T12:00:00.000Z",
        },
      ],
    });
    expect(db.carts[0]?.status).toBe("finalized");
  });

  it("returns named missing items and null pricesAsOf for stores with no priced lines", async () => {
    const db = new FakeCartDb();
    const cart = await db.getOrCreateActiveCart(deviceId);
    await db.upsertCartItem(cart.id, milkId, 1);
    await db.upsertCartItem(cart.id, breadId, 1);
    db.setPrice(milkId, storeOneId, 2);
    db.setPrice(breadId, storeOneId, 1);
    app = await buildTestApp(db);

    const response = await app.inject({
      method: "POST",
      url: "/carts/current/finalize",
      headers: { "x-device-id": deviceId },
      payload: { storeIds: [storeOneId, storeTwoId] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().perStoreTotals).toContainEqual(
      expect.objectContaining({
        storeId: storeTwoId,
        total: 0,
        pricesAsOf: null,
        missingItems: [
          { productId: milkId, name: "Milk" },
          { productId: breadId, name: "Bread" },
        ],
        coveredItemCount: 0,
        itemCount: 2,
      }),
    );
  });

  it("upserts watches for finalized cart items with winning-store baselines", async () => {
    const db = new FakeCartDb();
    const cart = await db.getOrCreateActiveCart(deviceId);
    await db.upsertCartItem(cart.id, milkId, 1);
    await db.upsertCartItem(cart.id, breadId, 1);
    db.setPrice(milkId, storeOneId, 2.5);
    db.setPrice(breadId, storeOneId, 1.5);
    db.setPrice(milkId, storeTwoId, 3);
    db.setPrice(breadId, storeTwoId, 2);
    app = await buildTestApp(db);

    const response = await app.inject({
      method: "POST",
      url: "/carts/current/finalize",
      headers: { "x-device-id": deviceId },
      payload: { storeIds: [storeOneId, storeTwoId] },
    });

    expect(response.statusCode).toBe(200);
    expect(db.watches).toMatchObject([
      {
        deviceId,
        productId: milkId,
        storeIds: [storeOneId, storeTwoId],
        baselinePrice: 2.5,
        active: true,
      },
      {
        deviceId,
        productId: breadId,
        storeIds: [storeOneId, storeTwoId],
        baselinePrice: 1.5,
        active: true,
      },
    ]);
  });

  it("returns 400 when finalizing an empty cart", async () => {
    const db = new FakeCartDb();
    await db.getOrCreateActiveCart(deviceId);
    app = await buildTestApp(db);

    const response = await app.inject({
      method: "POST",
      url: "/carts/current/finalize",
      headers: { "x-device-id": deviceId },
      payload: { storeIds: [storeOneId] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when finalizing with more than forty stores", async () => {
    const db = new FakeCartDb();
    const cart = await db.getOrCreateActiveCart(deviceId);
    await db.upsertCartItem(cart.id, milkId, 1);
    app = await buildTestApp(db);
    const storeIds = Array.from(
      { length: 41 },
      (_, index) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );

    const response = await app.inject({
      method: "POST",
      url: "/carts/current/finalize",
      headers: { "x-device-id": deviceId },
      payload: { storeIds },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when x-device-id is missing", async () => {
    app = await buildTestApp(new FakeCartDb());

    const response = await app.inject({ method: "POST", url: "/carts" });

    expect(response.statusCode).toBe(400);
  });
});

async function buildTestApp(db: CartwiseDb): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify();
  await app.register(cartApiPlugin, {
    db,
    getCollector: () => null,
  });
  return app;
}

class FakeCartDb implements CartwiseDb {
  carts: CartRow[] = [];
  items: CartItemWithProduct[] = [];
  watches: WatchRow[] = [];
  cacheEntry: CacheEntry | null = null;
  private priceRows = new Map<string, LatestProductStorePriceRow>();

  private products: ProductRow[] = [
    product(milkId, { name: "Milk", category: "dairy", sizeQty: 1, sizeUnit: "gal" }),
    product(breadId, { name: "Bread", category: "bakery", sizeQty: 16, sizeUnit: "oz" }),
  ];

  private stores: StoreRow[] = [
    store(storeOneId, "A Market"),
    store(storeTwoId, "B Market"),
  ];

  setPrice(productId: string, storeId: string, price: number): void {
    const storeRow = this.stores.find((storeRow) => storeRow.id === storeId);
    if (!storeRow) {
      throw new Error("unknown store");
    }

    this.priceRows.set(`${productId}:${storeId}`, {
      productId,
      storeId,
      storeProductId: `store-product-${productId}-${storeId}`,
      externalProductId: `external-${productId}-${storeId}`,
      store: storeRow,
      price: {
        id: `price-${productId}-${storeId}`,
        storeProductId: `store-product-${productId}-${storeId}`,
        price,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
        source: storeRow.chainSlug,
      },
    });
  }

  async getOrCreateActiveCart(deviceIdValue: string): Promise<CartRow> {
    const existing = this.carts.find(
      (cart) => cart.deviceId === deviceIdValue && cart.status === "active",
    );
    if (existing) {
      return existing;
    }

    const cart: CartRow = {
      id: `cart-${this.carts.length + 1}`,
      deviceId: deviceIdValue,
      status: "active",
      createdAt: new Date("2026-07-04T12:00:00Z"),
    };
    this.carts.push(cart);
    return cart;
  }

  async getActiveCartWithItems(deviceIdValue: string) {
    const cart =
      this.carts.find((cartRow) => cartRow.deviceId === deviceIdValue && cartRow.status === "active") ??
      null;
    if (!cart) {
      return null;
    }

    return {
      cart,
      items: this.items.filter((item) => item.cartId === cart.id),
    };
  }

  async upsertCartItem(cartId: string, productId: string, qty: number): Promise<CartItemRow> {
    const productRow = await this.getProductById(productId);
    if (!productRow) {
      throw new Error("unknown product");
    }

    const existing = this.items.find((item) => item.cartId === cartId && item.productId === productId);
    if (existing) {
      existing.qty = qty;
      return existing;
    }

    const item: CartItemWithProduct = {
      id: `item-${this.items.length + 1}`,
      cartId,
      productId,
      qty,
      product: productRow,
    };
    this.items.push(item);
    return item;
  }

  async removeCartItem(cartId: string, productId: string): Promise<void> {
    this.items = this.items.filter((item) => item.cartId !== cartId || item.productId !== productId);
  }

  async finalizeCart(cartId: string): Promise<void> {
    const cart = this.carts.find((cartRow) => cartRow.id === cartId);
    if (cart) {
      cart.status = "finalized";
    }
  }

  async getStoresByIds(ids: string[]): Promise<StoreRow[]> {
    return this.stores.filter((storeRow) => ids.includes(storeRow.id));
  }

  async listStoresByZip(zip: string): Promise<StoreRow[]> {
    return this.stores.filter((storeRow) => storeRow.zip.startsWith(zip));
  }

  async getProductById(id: string): Promise<ProductRow | null> {
    return this.products.find((productRow) => productRow.id === id) ?? null;
  }

  async getLatestPricesForProducts(
    productIds: string[],
    storeIds: string[],
  ): Promise<LatestProductStorePriceRow[]> {
    return Array.from(this.priceRows.values()).filter(
      (row) => productIds.includes(row.productId) && storeIds.includes(row.storeId),
    );
  }

  async getAlternativeProductsByCategory(): Promise<ProductRow[]> {
    return [];
  }

  async getCacheEntry(key: string): Promise<CacheEntry | null> {
    return this.cacheEntry?.key === key ? this.cacheEntry : null;
  }

  async setCacheEntry(key: string, payload: unknown, expiresAt: Date): Promise<void> {
    this.cacheEntry = { key, payload, expiresAt };
  }

  async upsertStore(): Promise<StoreRow> {
    throw new Error("not implemented");
  }

  async findProductByUpc(): Promise<ProductRow | null> {
    throw new Error("not implemented");
  }

  async findProductByIdentity(): Promise<ProductRow | null> {
    throw new Error("not implemented");
  }

  async productHasStoreProductForChain(): Promise<boolean> {
    throw new Error("not implemented");
  }

  async insertProduct(): Promise<ProductRow> {
    throw new Error("not implemented");
  }

  async upsertStoreProduct(): Promise<StoreProductRow> {
    throw new Error("not implemented");
  }

  async insertPriceSnapshot(input: InsertPriceSnapshotInput): Promise<PriceSnapshotRow> {
    return { id: "inserted-price", ...input };
  }

  async getStoreProductsForProduct(): Promise<StoreProductWithStore[]> {
    throw new Error("not implemented");
  }

  async upsertWatch(input: UpsertWatchInput): Promise<WatchRow> {
    const existing = this.watches.find(
      (watch) => watch.deviceId === input.deviceId && watch.productId === input.productId,
    );
    if (existing) {
      existing.storeIds = input.storeIds;
      existing.baselinePrice = input.baselinePrice;
      existing.active = true;
      return existing;
    }

    const watch: WatchRow = {
      id: `watch-${this.watches.length + 1}`,
      deviceId: input.deviceId,
      productId: input.productId,
      storeIds: input.storeIds,
      baselinePrice: input.baselinePrice,
      active: true,
      createdAt: new Date("2026-07-04T12:00:00Z"),
    };
    this.watches.push(watch);
    return watch;
  }

  async getActiveWatches(): Promise<WatchWithProduct[]> {
    throw new Error("not implemented");
  }

  async listWatchesForDevice(): Promise<WatchWithProduct[]> {
    throw new Error("not implemented");
  }

  async updateWatchBaseline(): Promise<void> {
    throw new Error("not implemented");
  }

  async deactivateWatchForDevice(): Promise<boolean> {
    throw new Error("not implemented");
  }

  async insertAlert(): Promise<AlertRow> {
    throw new Error("not implemented");
  }

  async insertAlertAndUpdateWatchBaseline(): Promise<AlertRow> {
    throw new Error("not implemented");
  }

  async markAlertSent(): Promise<void> {
    throw new Error("not implemented");
  }

  async listAlertsForDevice(): Promise<AlertWithDetails[]> {
    throw new Error("not implemented");
  }

  async markAlertReadForDevice(): Promise<boolean> {
    throw new Error("not implemented");
  }

  async upsertPushToken(): Promise<PushTokenRow> {
    throw new Error("not implemented");
  }

  async getPushTokenForDevice(): Promise<PushTokenRow | null> {
    throw new Error("not implemented");
  }
}

function product(id: string, overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id,
    name: "Product",
    brand: "Brand",
    sizeQty: 16,
    sizeUnit: "oz",
    upc: null,
    category: null,
    imageUrl: null,
    ...overrides,
  };
}

function store(id: string, name: string, chainSlug: ChainSlug = "kroger"): StoreRow {
  return {
    id,
    chainSlug,
    externalLocationId: `external-${id}`,
    name,
    address: `${name} Address`,
    zip: "45202",
    lat: 39.1,
    lng: -84.5,
  };
}
