import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply } from "fastify";

import { getCollector, getCollectorStats } from "./collectors/registry.js";
import { pool } from "./db/client.js";
import { cartwiseDb } from "./db/repository.js";
import { refreshWatches } from "./jobs/refresh-watches.js";
import { alertsApiPlugin } from "./routes/alerts-api.js";
import { cartApiPlugin } from "./routes/cart-api.js";
import { priceApiPlugin } from "./routes/price-api.js";

const DEFAULT_CORS_ALLOWED_ORIGINS = [
  "http://localhost:8081",
  "http://localhost:19006",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:19006",
];
const DB_CONNECTIVITY_TIMEOUT_MS = 30_000;
const DB_CONNECTIVITY_RETRY_DELAY_MS = 2_000;
const INFRASTRUCTURE_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNABORTED",
  "EPIPE",
]);

interface BuildAppOptions {
  logger?: boolean;
  rateLimitMax?: number;
}

interface ScheduledTask {
  stop(): void;
}

interface VerifyDbConnectivityOptions {
  databaseUrl?: string;
  query?: () => Promise<unknown>;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  app.setErrorHandler((error, request, reply) => {
    const clientErrorStatus = getClientErrorStatus(error);
    if (clientErrorStatus) {
      applyErrorHeaders(error, reply);
      return reply.code(clientErrorStatus).send({ error: clientErrorMessage(clientErrorStatus) });
    }

    if (isInfrastructureError(error)) {
      request.log.error({ error }, "Infrastructure request failure");
      return reply.code(503).send({ error: "Database unavailable" });
    }

    request.log.error({ error }, "Unhandled request failure");
    return reply.code(503).send({ error: "Service unavailable" });
  });

  await app.register(rateLimit, { max: options.rateLimitMax ?? 120, timeWindow: "1 minute" });

  const allowedOrigins = resolveCorsAllowedOrigins();
  app.addHook("onRequest", async (request, reply) => {
    const origin = normalizeOriginHeader(request.headers.origin);

    if (origin && allowedOrigins.has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Headers", "Content-Type, x-device-id");
      reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      reply.header("Vary", "Origin");
    }
  });

  app.options("*", async (_request, reply) => {
    return reply.code(204).send();
  });

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
  start().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

async function start(): Promise<void> {
  const port = resolvePort();
  const app = await buildApp();
  let scheduledTask: ScheduledTask | null = null;

  setupGracefulShutdown(app, () => scheduledTask);

  if (!(await verifyDbConnectivity())) {
    await app.close();
    await pool.end();
    process.exit(1);
  }

  scheduledTask = await scheduleWatchRefresh(app);

  try {
    await app.listen({ port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error({ error }, "Failed to start HTTP server");
    throw error;
  }
}

export function resolvePort(portValue = process.env.PORT ?? "3000"): number {
  const trimmedPort = portValue.trim();
  const parsedPort = Number(trimmedPort);
  if (
    !/^\d+$/.test(trimmedPort) ||
    !Number.isInteger(parsedPort) ||
    parsedPort < 1 ||
    parsedPort > 65_535
  ) {
    throw new Error(`Invalid PORT "${portValue}". PORT must be an integer from 1 to 65535.`);
  }

  return parsedPort;
}

async function verifyDbConnectivity(options: VerifyDbConnectivityOptions = {}): Promise<boolean> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? "postgres://localhost:5432/cartwise";
  const query = options.query ?? (() => pool.query("select 1"));
  const retryDelayMs = options.retryDelayMs ?? DB_CONNECTIVITY_RETRY_DELAY_MS;
  const sleep = options.sleep ?? delay;
  const timeoutMs = options.timeoutMs ?? DB_CONNECTIVITY_TIMEOUT_MS;
  const maxAttempts = Math.max(1, Math.floor(timeoutMs / retryDelayMs) + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await query();
      return true;
    } catch (error) {
      const url = redactDatabaseUrl(databaseUrl);

      if (attempt === maxAttempts) {
        console.error(
          `Cartwise API cannot reach Postgres at ${url} after ${attempt} attempts over ${Math.round(
            timeoutMs / 1_000,
          )}s — run npm run dev for guided setup or npm run dev:mock for UI-only`,
          error,
        );
        return false;
      }

      console.error(
        `Cartwise API cannot reach Postgres at ${url} (attempt ${attempt}/${maxAttempts}); retrying in ${retryDelayMs}ms`,
        error,
      );
      await sleep(retryDelayMs);
    }
  }

  return false;
}

async function scheduleWatchRefresh(app: FastifyInstance): Promise<ScheduledTask | null> {
  if (process.env.DISABLE_CRON === "1") {
    return null;
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

  const scheduledTask = schedule("0 6 * * *", () => {
    void refreshWatches({
      db: cartwiseDb,
      getCollector,
      logger: app.log,
    }).catch((error) => {
      app.log.error({ error }, "Scheduled watch refresh failed");
    });
  });

  if (!isScheduledTask(scheduledTask)) {
    throw new Error("node-cron schedule function did not return a stoppable task");
  }

  return scheduledTask;
}

function setupGracefulShutdown(
  app: FastifyInstance,
  getScheduledTask: () => ScheduledTask | null,
): void {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.log.info({ signal }, "Shutting down Cartwise API");

    try {
      getScheduledTask()?.stop();
      await app.close();
      await pool.end();
      process.exit(0);
    } catch (error) {
      app.log.error({ error }, "Graceful shutdown failed");
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

export function resolveCorsAllowedOrigins(
  originList = process.env.CORS_ALLOWED_ORIGINS,
): Set<string> {
  const rawOrigins =
    originList && originList.trim().length > 0
      ? originList.split(",")
      : DEFAULT_CORS_ALLOWED_ORIGINS;

  return new Set(rawOrigins.map(normalizeOrigin).filter((origin): origin is string => Boolean(origin)));
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

function normalizeOrigin(origin: string): string | null {
  const trimmedOrigin = origin.trim();
  if (!trimmedOrigin) {
    return null;
  }

  try {
    return new URL(trimmedOrigin).origin;
  } catch {
    return null;
  }
}

function normalizeOriginHeader(origin: string | undefined): string | null {
  if (!origin) {
    return null;
  }

  return normalizeOrigin(origin);
}

function getClientErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }

  const status = error.statusCode ?? error.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500) {
    return status;
  }

  if (error.validation) {
    return 400;
  }

  return null;
}

function applyErrorHeaders(error: unknown, reply: FastifyReply): void {
  if (!isRecord(error) || !isRecord(error.headers)) {
    return;
  }

  const headers: Record<string, number | string | string[]> = {};
  for (const [header, value] of Object.entries(error.headers)) {
    if (typeof value === "number" || typeof value === "string" || isStringArray(value)) {
      headers[header] = value;
    }
  }

  if (Object.keys(headers).length > 0) {
    reply.headers(headers);
  }
}

function clientErrorMessage(status: number): string {
  if (status === 429) {
    return "Too many requests";
  }

  if (status === 404) {
    return "Not found";
  }

  return "Invalid request";
}

function isInfrastructureError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const errorCode = error.code;
  if (typeof errorCode === "string") {
    return INFRASTRUCTURE_ERROR_CODES.has(errorCode) || /^[0-9A-Z]{5}$/.test(errorCode);
  }

  return error.cause ? isInfrastructureError(error.cause) : false;
}

function isScheduledTask(task: unknown): task is ScheduledTask {
  return typeof task === "object" && task !== null && typeof (task as ScheduledTask).stop === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
