import type { ChainSlug } from "@cartwise/shared";
import { describe, expect, it, vi } from "vitest";

import type { CollectedProduct, Collector } from "../collectors/types.js";
import type {
  AlertRow,
  AlertWithDetails,
  LatestProductStorePriceRow,
  PriceSnapshotRow,
  ProductRow,
  PushTokenRow,
  StoreRow,
  WatchWithProduct,
} from "../db/repository.js";
import { isPriceDrop, refreshWatches } from "./refresh-watches.js";

type SendPush = NonNullable<Parameters<typeof refreshWatches>[0]["sendPush"]>;

const storeOneId = "10000000-0000-4000-8000-000000000001";
const storeTwoId = "10000000-0000-4000-8000-000000000002";
const productOneId = "00000000-0000-4000-8000-000000000001";
const productTwoId = "00000000-0000-4000-8000-000000000002";

describe("refreshWatches", () => {
  it("detects drops at exactly one dollar and exactly ten percent", () => {
    expect(isPriceDrop(10, 9)).toBe(true);
    expect(isPriceDrop(20, 18)).toBe(true);
    expect(isPriceDrop(10, 9.01)).toBe(false);
  });

  it("inserts an alert and updates the watch baseline after a drop", async () => {
    const db = new FakeRefreshDb();
    db.addWatch({ id: "watch-1", productId: productOneId, storeIds: [storeOneId], baselinePrice: 10 });
    db.setLatestPrice(productOneId, storeOneId, 10);
    const collector = new FakeCollector();
    collector.setPrice(productOneId, storeOneId, 8.99);

    const result = await refreshWatches({
      db: db.asDb(),
      getCollector: () => collector,
      cache: uncached(),
    });

    expect(result).toMatchObject({ checked: 1, alerts: 1, errors: [] });
    expect(db.alerts).toMatchObject([{ watchId: "watch-1", oldPrice: 10, newPrice: 8.99 }]);
    expect(db.watches[0]?.baselinePrice).toBe(8.99);
  });

  it("retries an unsent alert after a push failure on the next run", async () => {
    const db = new FakeRefreshDb();
    db.addWatch({ id: "watch-1", productId: productOneId, storeIds: [storeOneId], baselinePrice: 10 });
    db.setPushToken("device-watch-1", "ExponentPushToken[watch-1]");
    db.setLatestPrice(productOneId, storeOneId, 10);
    const collector = new FakeCollector();
    collector.setPrice(productOneId, storeOneId, 8.99);
    const sendPush = vi
      .fn<SendPush>()
      .mockRejectedValueOnce(new Error("push failed"))
      .mockResolvedValue(undefined);

    const firstResult = await refreshWatches({
      db: db.asDb(),
      getCollector: () => collector,
      cache: uncached(),
      sendPush,
      now: () => new Date("2026-07-04T14:00:00Z"),
    });
    const secondResult = await refreshWatches({
      db: db.asDb(),
      getCollector: () => collector,
      cache: uncached(),
      sendPush,
      now: () => new Date("2026-07-05T14:00:00Z"),
    });

    expect(firstResult).toMatchObject({
      checked: 1,
      alerts: 1,
      errors: [{ watchId: "watch-1", message: "push failed" }],
    });
    expect(secondResult).toMatchObject({ checked: 1, alerts: 0, errors: [] });
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(db.alerts).toHaveLength(1);
    expect(db.alerts[0]?.sentAt).toEqual(new Date("2026-07-05T14:00:00Z"));
    expect(db.watches[0]?.baselinePrice).toBe(8.99);
  });

  it("sends exactly one push for a successful drop even if the price oscillates", async () => {
    const db = new FakeRefreshDb();
    db.addWatch({ id: "watch-1", productId: productOneId, storeIds: [storeOneId], baselinePrice: 10 });
    db.setPushToken("device-watch-1", "ExponentPushToken[watch-1]");
    db.setLatestPrice(productOneId, storeOneId, 10);
    const collector = new FakeCollector();
    collector.setPrice(productOneId, storeOneId, 8.99);
    const sendPush = vi.fn<SendPush>().mockResolvedValue(undefined);

    const firstResult = await refreshWatches({
      db: db.asDb(),
      getCollector: () => collector,
      cache: uncached(),
      sendPush,
    });
    collector.setPrice(productOneId, storeOneId, 10);
    const secondResult = await refreshWatches({
      db: db.asDb(),
      getCollector: () => collector,
      cache: uncached(),
      sendPush,
    });
    collector.setPrice(productOneId, storeOneId, 8.99);
    const thirdResult = await refreshWatches({
      db: db.asDb(),
      getCollector: () => collector,
      cache: uncached(),
      sendPush,
    });

    expect(firstResult).toMatchObject({ checked: 1, alerts: 1, errors: [] });
    expect(secondResult).toMatchObject({ checked: 1, alerts: 0, errors: [] });
    expect(thirdResult).toMatchObject({ checked: 1, alerts: 0, errors: [] });
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(db.alerts).toHaveLength(1);
  });

  it("does not persist a duplicate alert when the baseline update fails", async () => {
    const db = new FakeRefreshDb();
    db.addWatch({ id: "watch-1", productId: productOneId, storeIds: [storeOneId], baselinePrice: 10 });
    db.setPushToken("device-watch-1", "ExponentPushToken[watch-1]");
    db.failNextBaselineUpdate("watch-1");
    db.setLatestPrice(productOneId, storeOneId, 10);
    const collector = new FakeCollector();
    collector.setPrice(productOneId, storeOneId, 8.99);
    const sendPush = vi.fn<SendPush>().mockResolvedValue(undefined);

    const firstResult = await refreshWatches({
      db: db.asDb(),
      getCollector: () => collector,
      cache: uncached(),
      sendPush,
    });
    const secondResult = await refreshWatches({
      db: db.asDb(),
      getCollector: () => collector,
      cache: uncached(),
      sendPush,
    });

    expect(firstResult).toMatchObject({
      checked: 1,
      alerts: 0,
      errors: [{ watchId: "watch-1", message: "baseline update failed" }],
    });
    expect(secondResult).toMatchObject({ checked: 1, alerts: 1, errors: [] });
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(db.alerts).toHaveLength(1);
    expect(db.alerts[0]).toMatchObject({ watchId: "watch-1", oldPrice: 10, newPrice: 8.99 });
    expect(db.watches[0]?.baselinePrice).toBe(8.99);
  });

  it("continues refreshing other watches when one collector call fails", async () => {
    const db = new FakeRefreshDb();
    db.addWatch({ id: "watch-good", productId: productOneId, storeIds: [storeOneId], baselinePrice: 10 });
    db.addWatch({ id: "watch-bad", productId: productTwoId, storeIds: [storeTwoId], baselinePrice: 10 });
    db.setLatestPrice(productOneId, storeOneId, 10);
    db.setLatestPrice(productTwoId, storeTwoId, 10);
    const collector = new FakeCollector();
    collector.setPrice(productOneId, storeOneId, 8);
    collector.failLocation(`external-${storeTwoId}`);

    const result = await refreshWatches({
      db: db.asDb(),
      getCollector: () => collector,
      cache: uncached(),
    });

    expect(result.checked).toBe(2);
    expect(result.alerts).toBe(1);
    expect(result.errors).toEqual([{ watchId: "watch-bad", message: "collector failed" }]);
    expect(db.alerts).toMatchObject([{ watchId: "watch-good", newPrice: 8 }]);
    expect(db.watches.find((watch) => watch.id === "watch-good")?.baselinePrice).toBe(8);
    expect(db.watches.find((watch) => watch.id === "watch-bad")?.baselinePrice).toBe(10);
  });
});

class FakeRefreshDb {
  watches: WatchWithProduct[] = [];
  alerts: AlertRow[] = [];
  private rows = new Map<string, LatestProductStorePriceRow>();
  private pushTokens = new Map<string, PushTokenRow>();
  private failingBaselineUpdates = new Set<string>();
  private stores = new Map<string, StoreRow>([
    [storeOneId, store(storeOneId, "A Market")],
    [storeTwoId, store(storeTwoId, "B Market")],
  ]);

  asDb() {
    return this as unknown as Parameters<typeof refreshWatches>[0]["db"];
  }

  addWatch(input: {
    id: string;
    productId: string;
    storeIds: string[];
    baselinePrice: number;
  }): void {
    this.watches.push({
      id: input.id,
      deviceId: `device-${input.id}`,
      productId: input.productId,
      storeIds: input.storeIds,
      baselinePrice: input.baselinePrice,
      active: true,
      createdAt: new Date("2026-07-04T12:00:00Z"),
      product: product(input.productId, `Product ${input.productId.slice(-1)}`),
    });
  }

  setPushToken(deviceId: string, expoPushToken: string): void {
    this.pushTokens.set(deviceId, {
      id: `push-token-${deviceId}`,
      deviceId,
      expoPushToken,
      updatedAt: new Date("2026-07-04T12:00:00Z"),
    });
  }

  failNextBaselineUpdate(watchId: string): void {
    this.failingBaselineUpdates.add(watchId);
  }

  setLatestPrice(productId: string, storeId: string, price: number): void {
    const storeRow = this.stores.get(storeId);
    if (!storeRow) {
      throw new Error("unknown store");
    }

    this.rows.set(`${productId}:${storeId}`, {
      productId,
      storeId,
      storeProductId: `store-product-${productId}-${storeId}`,
      externalProductId: productId,
      store: storeRow,
      price: {
        id: `price-${productId}-${storeId}`,
        storeProductId: `store-product-${productId}-${storeId}`,
        price,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
        source: "kroger",
      },
    });
  }

  async getActiveWatches(): Promise<WatchWithProduct[]> {
    return this.watches.filter((watch) => watch.active);
  }

  async getLatestPricesForProducts(
    productIds: string[],
    storeIds: string[],
  ): Promise<LatestProductStorePriceRow[]> {
    return Array.from(this.rows.values()).filter(
      (row) => productIds.includes(row.productId) && storeIds.includes(row.storeId),
    );
  }

  async insertPriceSnapshot(input: {
    storeProductId: string;
    price: number;
    promoPrice: number | null;
    capturedAt: Date;
    source: ChainSlug;
  }): Promise<PriceSnapshotRow> {
    const row = Array.from(this.rows.values()).find(
      (latestRow) => latestRow.storeProductId === input.storeProductId,
    );
    if (!row) {
      throw new Error("unknown store product");
    }

    row.price = {
      id: `snapshot-${input.storeProductId}`,
      storeProductId: input.storeProductId,
      price: input.price,
      promoPrice: input.promoPrice,
      capturedAt: input.capturedAt,
      source: input.source,
    };
    return row.price;
  }

  async insertAlert(input: {
    watchId: string;
    storeId: string;
    oldPrice: number;
    newPrice: number;
    capturedAt: Date;
  }): Promise<AlertRow> {
    const alert: AlertRow = {
      id: `alert-${this.alerts.length + 1}`,
      sentAt: null,
      read: false,
      ...input,
    };
    this.alerts.push(alert);
    return alert;
  }

  async insertAlertAndUpdateWatchBaseline(
    input: {
      watchId: string;
      storeId: string;
      oldPrice: number;
      newPrice: number;
      capturedAt: Date;
    },
    baselinePrice: number,
  ): Promise<AlertRow> {
    if (this.failingBaselineUpdates.delete(input.watchId)) {
      throw new Error("baseline update failed");
    }

    const alert: AlertRow = {
      id: `alert-${this.alerts.length + 1}`,
      sentAt: null,
      read: false,
      ...input,
    };
    const watch = this.watches.find((candidate) => candidate.id === input.watchId);
    if (watch) {
      watch.baselinePrice = baselinePrice;
    }

    this.alerts.push(alert);
    return alert;
  }

  async updateWatchBaseline(watchId: string, baselinePrice: number): Promise<void> {
    if (this.failingBaselineUpdates.delete(watchId)) {
      throw new Error("baseline update failed");
    }

    const watch = this.watches.find((candidate) => candidate.id === watchId);
    if (watch) {
      watch.baselinePrice = baselinePrice;
    }
  }

  async getPushTokenForDevice(deviceId: string): Promise<PushTokenRow | null> {
    return this.pushTokens.get(deviceId) ?? null;
  }

  async listAlertsForDevice(deviceId: string): Promise<AlertWithDetails[]> {
    const rows: AlertWithDetails[] = [];
    for (const alert of this.alerts) {
      const watch = this.watches.find((candidate) => candidate.id === alert.watchId);
      const storeRow = this.stores.get(alert.storeId);
      if (!watch || !storeRow || watch.deviceId !== deviceId) {
        continue;
      }

      const { product: watchProduct, ...watchRow } = watch;
      rows.push({
        ...alert,
        watch: watchRow,
        product: watchProduct,
        store: storeRow,
      });
    }

    return rows;
  }

  async markAlertSent(alertId: string, sentAt: Date): Promise<void> {
    const alert = this.alerts.find((candidate) => candidate.id === alertId);
    if (alert) {
      alert.sentAt = sentAt;
    }
  }
}

class FakeCollector implements Collector {
  chain: ChainSlug = "kroger";
  private prices = new Map<string, number>();
  private failingLocations = new Set<string>();

  setPrice(productId: string, storeId: string, price: number): void {
    this.prices.set(`${productId}:${storeId}`, price);
  }

  failLocation(externalLocationId: string): void {
    this.failingLocations.add(externalLocationId);
  }

  async findStores(): Promise<never[]> {
    return [];
  }

  async searchProducts(): Promise<never[]> {
    return [];
  }

  async getPrices(
    externalProductIds: string[],
    externalLocationId: string,
  ): Promise<CollectedProduct[]> {
    if (this.failingLocations.has(externalLocationId)) {
      throw new Error("collector failed");
    }

    const storeId = externalLocationId.replace("external-", "");
    const collectedProducts: CollectedProduct[] = [];
    for (const externalProductId of externalProductIds) {
      const price = this.prices.get(`${externalProductId}:${storeId}`);
      if (price === undefined) {
        continue;
      }

      collectedProducts.push({
        externalProductId,
        name: `Product ${externalProductId.slice(-1)}`,
        brand: null,
        sizeRaw: null,
        upc: null,
        category: null,
        imageUrl: null,
        price,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T13:00:00Z"),
      });
    }

    return collectedProducts;
  }
}

function uncached() {
  return {
    async withCache<T>(_key: string, _ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}

function product(id: string, name: string): ProductRow {
  return {
    id,
    name,
    brand: null,
    sizeQty: null,
    sizeUnit: null,
    upc: null,
    category: null,
    imageUrl: null,
  };
}

function store(id: string, name: string): StoreRow {
  return {
    id,
    chainSlug: "kroger",
    externalLocationId: `external-${id}`,
    name,
    address: `${name} Address`,
    zip: "45202",
    lat: 39.1,
    lng: -84.5,
  };
}
