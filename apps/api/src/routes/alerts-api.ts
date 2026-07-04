import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";

import type {
  AlertWithDetails,
  CartwiseDb,
  ProductRow,
  StoreRow,
  WatchWithProduct,
} from "../db/repository.js";

const deviceIdHeaderSchema = z.string().trim().min(1).max(64);
const pushTokenBodySchema = z.object({
  expoPushToken: z.string().trim().min(1).max(256),
});
const idParamsSchema = z.object({
  id: z.string().uuid(),
});

export interface AlertsApiDeps {
  db: CartwiseDb;
  now?: () => Date;
}

export const alertsApiPlugin: FastifyPluginAsync<AlertsApiDeps> = async (app, deps) => {
  const now = deps.now ?? (() => new Date());

  app.post("/push-tokens", async (request, reply) => {
    const deviceId = parseDeviceId(request.headers["x-device-id"], reply);
    const body = parseOr400(pushTokenBodySchema, request.body, reply);
    if (!deviceId || !body) {
      return reply;
    }

    const token = await deps.db.upsertPushToken(deviceId, body.expoPushToken, now());
    return {
      pushToken: {
        id: token.id,
        deviceId: token.deviceId,
        expoPushToken: token.expoPushToken,
        updatedAt: token.updatedAt.toISOString(),
      },
    };
  });

  app.get("/alerts", async (request, reply) => {
    const deviceId = parseDeviceId(request.headers["x-device-id"], reply);
    if (!deviceId) {
      return reply;
    }

    const [alerts, watches] = await Promise.all([
      deps.db.listAlertsForDevice(deviceId),
      deps.db.listWatchesForDevice(deviceId),
    ]);

    return {
      alerts: alerts.map(toAlertResponse),
      watches: watches.map(toWatchResponse),
    };
  });

  app.put("/alerts/:id/read", async (request, reply) => {
    const deviceId = parseDeviceId(request.headers["x-device-id"], reply);
    const params = parseOr400(idParamsSchema, request.params, reply);
    if (!deviceId || !params) {
      return reply;
    }

    const updated = await deps.db.markAlertReadForDevice(deviceId, params.id);
    if (!updated) {
      return reply.code(404).send({ error: "Alert not found" });
    }

    return { ok: true };
  });

  app.delete("/watches/:id", async (request, reply) => {
    const deviceId = parseDeviceId(request.headers["x-device-id"], reply);
    const params = parseOr400(idParamsSchema, request.params, reply);
    if (!deviceId || !params) {
      return reply;
    }

    const updated = await deps.db.deactivateWatchForDevice(deviceId, params.id);
    if (!updated) {
      return reply.code(404).send({ error: "Watch not found" });
    }

    return { ok: true };
  });
};

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

function toAlertResponse(alert: AlertWithDetails) {
  return {
    id: alert.id,
    watchId: alert.watchId,
    productId: alert.watch.productId,
    product: toProductSummary(alert.product),
    storeId: alert.storeId,
    store: toStoreSummary(alert.store),
    oldPrice: alert.oldPrice,
    newPrice: alert.newPrice,
    capturedAt: alert.capturedAt.toISOString(),
    sentAt: alert.sentAt ? alert.sentAt.toISOString() : null,
    read: alert.read,
  };
}

function toWatchResponse(watch: WatchWithProduct) {
  return {
    id: watch.id,
    productId: watch.productId,
    product: toProductSummary(watch.product),
    storeIds: watch.storeIds,
    baselinePrice: watch.baselinePrice,
    active: watch.active,
    createdAt: watch.createdAt.toISOString(),
  };
}

function toProductSummary(product: ProductRow) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
  };
}

function toStoreSummary(store: StoreRow) {
  return {
    id: store.id,
    name: store.name,
    chain: store.chainSlug,
  };
}
