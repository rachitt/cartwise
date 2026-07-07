import { describe, expect, it } from "vitest";

import type { CollectedProduct } from "../collectors/types.js";
import type {
  AlertRow,
  AlertWithDetails,
  CartwiseDb,
  CartItemRow,
  CartRow,
  CartWithItems,
  CacheEntry,
  FindProductIdentity,
  InsertPriceSnapshotInput,
  InsertProductInput,
  LatestProductStorePriceRow,
  ProductRow,
  PushTokenRow,
  StoreProductWithStore,
  StoreProductRow,
  StoreRow,
  UpsertWatchInput,
  WatchRow,
  WatchWithProduct,
} from "../db/repository.js";
import { upsertCollectedProduct } from "./matcher.js";

describe("upsertCollectedProduct", () => {
  it("prefers UPC matches over normalized identity matches", async () => {
    const upcProduct = product("upc-product", { upc: "000111" });
    const identityProduct = product("identity-product");
    const db = new FakeCatalogDb([upcProduct, identityProduct]);

    db.findProductByIdentity = async () => identityProduct;

    const matched = await upsertCollectedProduct(
      db,
      collectedProduct({ upc: "000111", name: "Same Name", brand: "Same Brand", sizeRaw: "12 oz" }),
      "store-1",
      "kroger",
    );

    expect(matched.product.id).toBe("upc-product");
    expect(db.insertedProducts).toEqual([]);
  });

  it("matches by normalized name, brand, and parsed size when UPC is absent", async () => {
    const existing = product("identity-product", {
      name: "Whole Milk",
      brand: "Kroger",
      sizeQty: 1,
      sizeUnit: "gal",
    });
    const db = new FakeCatalogDb([existing]);

    const matched = await upsertCollectedProduct(
      db,
      collectedProduct({
        upc: null,
        name: "  whole milk  ",
        brand: " kroger ",
        sizeRaw: "1 gallon",
      }),
      "store-1",
      "kroger",
    );

    expect(matched.product.id).toBe("identity-product");
    expect(db.insertedProducts).toEqual([]);
  });

  it("inserts a canonical product and price snapshot when no match exists", async () => {
    const db = new FakeCatalogDb([]);

    const matched = await upsertCollectedProduct(
      db,
      collectedProduct({
        name: "Sparkling Water",
        brand: "Simple Truth",
        sizeRaw: "16.9 fl oz",
        price: 1.25,
        promoPrice: 0.99,
      }),
      "store-1",
      "kroger",
    );

    expect(matched.product).toMatchObject({
      name: "Sparkling Water",
      brand: "Simple Truth",
      sizeQty: 16.9,
      sizeUnit: "floz",
    });
    expect(db.insertedProducts).toHaveLength(1);
    expect(db.priceSnapshots).toEqual([
      {
        storeProductId: "store-product-1",
        price: 1.25,
        promoPrice: 0.99,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
        source: "kroger",
      },
    ]);
    expect(matched.price).toMatchObject({
      storeId: "store-1",
      productId: matched.product.id,
      price: 1.25,
      promoPrice: 0.99,
      capturedAt: "2026-07-04T12:00:00.000Z",
      source: "kroger",
    });
  });
});

class FakeCatalogDb implements CartwiseDb {
  insertedProducts: ProductRow[] = [];
  priceSnapshots: InsertPriceSnapshotInput[] = [];
  private storeProductCounter = 0;

  constructor(private readonly products: ProductRow[]) {}

  async findProductByUpc(upc: string): Promise<ProductRow | null> {
    return this.products.find((productRow) => productRow.upc === upc) ?? null;
  }

  async findProductByIdentity(identity: FindProductIdentity): Promise<ProductRow | null> {
    return (
      this.products.find(
        (productRow) =>
          normalize(productRow.name) === normalize(identity.name) &&
          nullableNormalize(productRow.brand) === nullableNormalize(identity.brand) &&
          productRow.sizeQty === identity.sizeQty &&
          productRow.sizeUnit === identity.sizeUnit,
      ) ?? null
    );
  }

  async insertProduct(input: InsertProductInput): Promise<ProductRow> {
    const row = product(`inserted-${this.insertedProducts.length + 1}`, input);
    this.insertedProducts.push(row);
    this.products.push(row);
    return row;
  }

  async upsertStoreProduct(
    productId: string,
    storeId: string,
    externalProductId: string,
  ): Promise<StoreProductRow> {
    this.storeProductCounter += 1;
    return {
      id: `store-product-${this.storeProductCounter}`,
      productId,
      storeId,
      externalProductId,
    };
  }

  async insertPriceSnapshot(input: InsertPriceSnapshotInput) {
    this.priceSnapshots.push(input);
    return { id: `price-${this.priceSnapshots.length}`, ...input };
  }

  async getCacheEntry(_key: string): Promise<CacheEntry | null> {
    throw new Error("not implemented");
  }

  async setCacheEntry(): Promise<void> {
    throw new Error("not implemented");
  }

  async upsertStore(): Promise<StoreRow> {
    throw new Error("not implemented");
  }

  async getStoresByIds(): Promise<StoreRow[]> {
    throw new Error("not implemented");
  }

  async listStoresByZip(): Promise<StoreRow[]> {
    throw new Error("not implemented");
  }

  async getProductById(): Promise<ProductRow | null> {
    throw new Error("not implemented");
  }

  async getStoreProductsForProduct(): Promise<StoreProductWithStore[]> {
    throw new Error("not implemented");
  }

  async getOrCreateActiveCart(): Promise<CartRow> {
    throw new Error("not implemented");
  }

  async getActiveCartWithItems(): Promise<CartWithItems | null> {
    throw new Error("not implemented");
  }

  async upsertCartItem(): Promise<CartItemRow> {
    throw new Error("not implemented");
  }

  async removeCartItem(): Promise<void> {
    throw new Error("not implemented");
  }

  async finalizeCart(): Promise<void> {
    throw new Error("not implemented");
  }

  async getLatestPricesForProducts(): Promise<LatestProductStorePriceRow[]> {
    throw new Error("not implemented");
  }

  async getAlternativeProductsByCategory(): Promise<ProductRow[]> {
    throw new Error("not implemented");
  }

  async upsertWatch(_input: UpsertWatchInput): Promise<WatchRow> {
    throw new Error("not implemented");
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
    name: "Same Name",
    brand: "Same Brand",
    sizeQty: 12,
    sizeUnit: "oz",
    upc: null,
    category: null,
    imageUrl: null,
    ...overrides,
  };
}

function collectedProduct(overrides: Partial<CollectedProduct> = {}): CollectedProduct {
  return {
    externalProductId: "external-1",
    name: "Same Name",
    brand: "Same Brand",
    sizeRaw: "12 oz",
    upc: null,
    category: null,
    imageUrl: null,
    price: null,
    promoPrice: null,
    capturedAt: new Date("2026-07-04T12:00:00Z"),
    ...overrides,
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function nullableNormalize(value: string | null): string | null {
  return value ? normalize(value) : null;
}
