import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

const app = Fastify({ logger: true });

await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

app.get("/health", async () => ({
  status: "ok",
  service: "cartwise-price-api",
}));

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
