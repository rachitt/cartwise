import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

import { getCollector, getCollectorStats } from "./collectors/registry.js";
import { cartwiseDb } from "./db/repository.js";
import { refreshWatches } from "./jobs/refresh-watches.js";
import { alertsApiPlugin } from "./routes/alerts-api.js";
import { cartApiPlugin } from "./routes/cart-api.js";
import { priceApiPlugin } from "./routes/price-api.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

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

  await scheduleWatchRefresh(app);

  app.listen({ port, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
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
