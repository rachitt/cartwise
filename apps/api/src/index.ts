import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

import { getCollector, getCollectorStats } from "./collectors/registry.js";
import { pool } from "./db/client.js";
import { cartwiseDb } from "./db/repository.js";
import { refreshWatches } from "./jobs/refresh-watches.js";
import { alertsApiPlugin } from "./routes/alerts-api.js";
import { cartApiPlugin } from "./routes/cart-api.js";
import { priceApiPlugin } from "./routes/price-api.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;

    if (origin) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Headers", "Content-Type, x-device-id");
      reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      reply.header("Vary", "Origin");
    }

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.get("/health", async () => ({
    status: "ok",
    service: "cartwise-price-api",
    collectors: getCollectorStats(),
  }));

  await app.register(priceApiPlugin, { db: cartwiseDb, getCollector });
  await app.register(cartApiPlugin, { db: cartwiseDb, getCollector });
  await app.register(alertsApiPlugin, { db: cartwiseDb });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3000);

  await verifyDbConnectivity();
  await scheduleWatchRefresh(app);

  app.listen({ port, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}

async function verifyDbConnectivity(): Promise<void> {
  try {
    await pool.query("select 1");
  } catch {
    const url = redactDatabaseUrl(process.env.DATABASE_URL ?? "postgres://localhost:5432/cartwise");
    console.error(
      `Cartwise API cannot reach Postgres at ${url} — run npm run dev for guided setup or npm run dev:mock for UI-only`,
    );
    process.exit(1);
  }
}

async function scheduleWatchRefresh(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  if (process.env.DISABLE_CRON === "1") {
    return;
  }

  const moduleName = "node-cron";
  const cronModule = (await import(moduleName)) as {
    schedule?: (expression: string, fn: () => void) => unknown;
    default?: { schedule?: (expression: string, fn: () => void) => unknown };
  };
  const schedule = cronModule.schedule ?? cronModule.default?.schedule;
  if (!schedule) {
    throw new Error("node-cron schedule function not found");
  }

  schedule("0 6 * * *", () => {
    void refreshWatches({
      db: cartwiseDb,
      getCollector,
      logger: app.log,
    }).catch((error) => {
      app.log.error({ error }, "Scheduled watch refresh failed");
    });
  });
}

function redactDatabaseUrl(connectionUrl: string): string {
  try {
    const url = new URL(connectionUrl);
    if (url.password) {
      url.password = "****";
    }
    return url.toString();
  } catch {
    return "<invalid DATABASE_URL>";
  }
}
