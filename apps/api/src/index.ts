import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

import { getCollector } from "./collectors/registry.js";
import { cartwiseDb } from "./db/repository.js";
import { priceApiPlugin } from "./routes/price-api.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.get("/health", async () => ({
    status: "ok",
    service: "cartwise-price-api",
  }));

  await app.register(priceApiPlugin, { db: cartwiseDb, getCollector });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3000);

  app.listen({ port, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
