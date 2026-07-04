import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type {
  AlertWithDetails,
  CartwiseDb,
  ProductRow,
  PushTokenRow,
  StoreRow,
  WatchWithProduct,
} from "../db/repository.js";
import { alertsApiPlugin } from "./alerts-api.js";

const deviceOne = "device-one";
const deviceTwo = "device-two";
const watchOneId = "20000000-0000-4000-8000-000000000001";
const watchTwoId = "20000000-0000-4000-8000-000000000002";
const alertOneId = "30000000-0000-4000-8000-000000000001";
const alertTwoId = "30000000-0000-4000-8000-000000000002";
const storeOneId = "10000000-0000-4000-8000-000000000001";
const productOneId = "00000000-0000-4000-8000-000000000001";

describe("alertsApiPlugin", () => {
  let app: ReturnType<typeof Fastify> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("upserts push tokens by device", async () => {
    const db = new FakeAlertsDb();
    app = await buildTestApp(db);

    const response = await app.inject({
      method: "POST",
      url: "/push-tokens",
      headers: { "x-device-id": deviceOne },
      payload: { expoPushToken: "ExponentPushToken[test]" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().pushToken).toMatchObject({
      deviceId: deviceOne,
      expoPushToken: "ExponentPushToken[test]",
      updatedAt: "2026-07-04T12:00:00.000Z",
    });
    expect(db.pushTokens).toHaveLength(1);
  });

  it("lists only the requesting device alerts and watches", async () => {
    const db = new FakeAlertsDb();
    db.seed();
    app = await buildTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/alerts",
      headers: { "x-device-id": deviceOne },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      alerts: [
        {
          id: alertOneId,
          watchId: watchOneId,
          product: { name: "Milk" },
          store: { name: "A Market" },
          oldPrice: 4,
          newPrice: 2.99,
          read: false,
        },
      ],
      watches: [
        {
          id: watchOneId,
          product: { name: "Milk" },
          baselinePrice: 2.99,
          active: true,
        },
      ],
    });
  });

  it("marks owned alerts read and returns 404 for another device", async () => {
    const db = new FakeAlertsDb();
    db.seed();
    app = await buildTestApp(db);

    const own = await app.inject({
      method: "PUT",
      url: `/alerts/${alertOneId}/read`,
      headers: { "x-device-id": deviceOne },
    });
    const scoped = await app.inject({
      method: "PUT",
      url: `/alerts/${alertTwoId}/read`,
      headers: { "x-device-id": deviceOne },
    });

    expect(own.statusCode).toBe(200);
    expect(scoped.statusCode).toBe(404);
    expect(db.alerts.find((alert) => alert.id === alertOneId)?.read).toBe(true);
    expect(db.alerts.find((alert) => alert.id === alertTwoId)?.read).toBe(false);
  });

  it("deactivates owned watches and returns 404 for another device", async () => {
    const db = new FakeAlertsDb();
    db.seed();
    app = await buildTestApp(db);

    const own = await app.inject({
      method: "DELETE",
      url: `/watches/${watchOneId}`,
      headers: { "x-device-id": deviceOne },
    });
    const scoped = await app.inject({
      method: "DELETE",
      url: `/watches/${watchTwoId}`,
      headers: { "x-device-id": deviceOne },
    });

    expect(own.statusCode).toBe(200);
    expect(scoped.statusCode).toBe(404);
    expect(db.watches.find((watch) => watch.id === watchOneId)?.active).toBe(false);
    expect(db.watches.find((watch) => watch.id === watchTwoId)?.active).toBe(true);
  });
});

async function buildTestApp(db: FakeAlertsDb): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify();
  await app.register(alertsApiPlugin, {
    db: db as unknown as CartwiseDb,
    now: () => new Date("2026-07-04T12:00:00Z"),
  });
  return app;
}

class FakeAlertsDb {
  watches: WatchWithProduct[] = [];
  alerts: AlertWithDetails[] = [];
  pushTokens: PushTokenRow[] = [];
  private product = product(productOneId, "Milk");
  private store = store(storeOneId, "A Market");

  seed(): void {
    const watchOne = watch(watchOneId, deviceOne, this.product);
    const watchTwo = watch(watchTwoId, deviceTwo, this.product);
    this.watches = [watchOne, watchTwo];
    this.alerts = [
      alert(alertOneId, watchOne, this.product, this.store, false),
      alert(alertTwoId, watchTwo, this.product, this.store, false),
    ];
  }

  async upsertPushToken(
    deviceId: string,
    expoPushToken: string,
    updatedAt: Date,
  ): Promise<PushTokenRow> {
    const existing = this.pushTokens.find((token) => token.deviceId === deviceId);
    if (existing) {
      existing.expoPushToken = expoPushToken;
      existing.updatedAt = updatedAt;
      return existing;
    }

    const token: PushTokenRow = {
      id: `push-${this.pushTokens.length + 1}`,
      deviceId,
      expoPushToken,
      updatedAt,
    };
    this.pushTokens.push(token);
    return token;
  }

  async listAlertsForDevice(deviceId: string): Promise<AlertWithDetails[]> {
    return this.alerts
      .filter((alertRow) => alertRow.watch.deviceId === deviceId)
      .sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime());
  }

  async listWatchesForDevice(deviceId: string): Promise<WatchWithProduct[]> {
    return this.watches.filter((watchRow) => watchRow.deviceId === deviceId && watchRow.active);
  }

  async markAlertReadForDevice(deviceId: string, alertId: string): Promise<boolean> {
    const alertRow = this.alerts.find(
      (candidate) => candidate.id === alertId && candidate.watch.deviceId === deviceId,
    );
    if (!alertRow) {
      return false;
    }

    alertRow.read = true;
    return true;
  }

  async deactivateWatchForDevice(deviceId: string, watchId: string): Promise<boolean> {
    const watchRow = this.watches.find(
      (candidate) => candidate.id === watchId && candidate.deviceId === deviceId,
    );
    if (!watchRow) {
      return false;
    }

    watchRow.active = false;
    return true;
  }
}

function alert(
  id: string,
  watchRow: WatchWithProduct,
  productRow: ProductRow,
  storeRow: StoreRow,
  read: boolean,
): AlertWithDetails {
  return {
    id,
    watchId: watchRow.id,
    storeId: storeRow.id,
    oldPrice: 4,
    newPrice: 2.99,
    capturedAt: new Date("2026-07-04T13:00:00Z"),
    sentAt: null,
    read,
    watch: watchRow,
    product: productRow,
    store: storeRow,
  };
}

function watch(id: string, deviceId: string, productRow: ProductRow): WatchWithProduct {
  return {
    id,
    deviceId,
    productId: productRow.id,
    storeIds: [storeOneId],
    baselinePrice: 2.99,
    active: true,
    createdAt: new Date("2026-07-04T12:00:00Z"),
    product: productRow,
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
