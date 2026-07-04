#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildCandidateConnectionUrls,
  databaseNameFromUrl,
  maintenanceDatabaseUrl,
  mergeApiEnv,
  redactDatabaseUrl,
} from "./dev-lib.mjs";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const apiDir = path.join(rootDir, "apps", "api");
const apiEnvPath = path.join(apiDir, ".env");
const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Pool } = apiRequire("pg");

const probeTimeoutMs = 2_000;
const dockerWaitMs = 30_000;

await main().catch((error) => {
  console.error(`Cartwise dev startup failed: ${friendlyError(error)}`);
  process.exit(1);
});

async function main() {
  console.log("Cartwise dev startup");

  let chosen = await chooseDatabase(buildCandidateConnectionUrls(process.env));

  if (!chosen) {
    const dockerAvailable = await commandSucceeds("docker", ["info"]);
    if (dockerAvailable) {
      console.log("No local Postgres candidate accepted connections; Docker is available, so starting docker compose.");
      const composeResult = await runSetupCommand("docker", ["compose", "up", "-d", "--wait"]);
      if (composeResult === 0) {
        chosen = await waitForDatabase(buildCandidateConnectionUrls({}), dockerWaitMs);
      } else {
        console.log("Docker Compose did not finish cleanly; falling back if no database is reachable.");
      }
    } else {
      console.log("Docker is not available, so database startup will be skipped.");
    }
  }

  if (!chosen) {
    console.warn("Warning: no usable Postgres was found and Docker could not start one; starting Expo with EXPO_PUBLIC_USE_MOCKS=1.");
    await startMockMobile();
    return;
  }

  console.log(`Using Postgres from ${chosen.label}: ${redactDatabaseUrl(chosen.url)}`);
  await writeApiEnv(chosen.url);
  await runSetup(chosen.url);
  await startFullStack(chosen.url);
}

async function chooseDatabase(candidates) {
  for (const candidate of candidates) {
    console.log(`Probing ${candidate.label}: ${redactDatabaseUrl(candidate.url)} (${candidate.reason})`);
    const result = await ensureDatabase(candidate.url);
    if (result.ok) {
      console.log(`Postgres accepted connections for ${candidate.label}.`);
      return { ...candidate, url: result.url };
    }
    console.log(`Skipping ${candidate.label}: ${result.message}`);
  }

  return null;
}

async function waitForDatabase(candidates, maxMs) {
  const deadline = Date.now() + maxMs;
  let lastMessage = "not probed yet";

  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      console.log(`Waiting for ${candidate.label}: ${redactDatabaseUrl(candidate.url)}`);
      const result = await ensureDatabase(candidate.url);
      if (result.ok) {
        console.log(`Postgres is ready at ${candidate.label}.`);
        return { ...candidate, url: result.url };
      }
      lastMessage = result.message;
    }
    await sleep(1_000);
  }

  console.log(`Postgres did not become ready within ${Math.round(maxMs / 1000)}s: ${lastMessage}`);
  return null;
}

async function ensureDatabase(connectionUrl) {
  const targetDb = databaseNameFromUrl(connectionUrl);
  const targetUrl = connectionUrl;
  const targetProbe = await probeConnection(targetUrl);
  if (targetProbe.ok) {
    return { ok: true, url: targetUrl };
  }

  if (!isMissingDatabaseError(targetProbe.error)) {
    return { ok: false, message: friendlyError(targetProbe.error) };
  }

  const maintenanceUrl = maintenanceDatabaseUrl(connectionUrl);
  const maintenanceProbe = await probeConnection(maintenanceUrl);
  if (!maintenanceProbe.ok) {
    return {
      ok: false,
      message: `database "${targetDb}" does not exist and maintenance database is unreachable (${friendlyError(
        maintenanceProbe.error,
      )})`,
    };
  }

  const createResult = await createDatabase(maintenanceUrl, targetDb);
  if (!createResult.ok) {
    return { ok: false, message: createResult.message };
  }

  const retry = await probeConnection(targetUrl);
  if (!retry.ok) {
    return { ok: false, message: `created database "${targetDb}" but could not reconnect (${friendlyError(retry.error)})` };
  }

  return { ok: true, url: targetUrl };
}

async function probeConnection(connectionUrl) {
  const pool = new Pool({
    connectionString: connectionUrl,
    connectionTimeoutMillis: probeTimeoutMs,
    idleTimeoutMillis: 500,
    max: 1,
  });

  try {
    await pool.query("select 1");
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function createDatabase(maintenanceUrl, databaseName) {
  const pool = new Pool({
    connectionString: maintenanceUrl,
    connectionTimeoutMillis: probeTimeoutMs,
    idleTimeoutMillis: 500,
    max: 1,
  });

  try {
    const existing = await pool.query("select 1 from pg_database where datname = $1", [databaseName]);
    if (existing.rowCount === 0) {
      await pool.query(`create database ${quoteIdentifier(databaseName)}`);
      console.log(`Created database "${databaseName}".`);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `could not create database "${databaseName}" (${friendlyError(error)})` };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function writeApiEnv(databaseUrl) {
  let existing = "";
  try {
    existing = await readFile(apiEnvPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(path.dirname(apiEnvPath), { recursive: true });
  await writeFile(apiEnvPath, mergeApiEnv(existing, databaseUrl), "utf8");
  console.log(`Wrote apps/api/.env with ${redactDatabaseUrl(databaseUrl)}.`);
}

async function runSetup(databaseUrl) {
  const env = { ...process.env, DATABASE_URL: databaseUrl };

  console.log("Running API migrations.");
  await runRequiredCommand("npm", ["run", "db:migrate", "--workspace", "apps/api"], env);

  console.log("Seeding API lookup data.");
  await runRequiredCommand("npm", ["run", "db:seed", "--workspace", "apps/api"], env);
}

async function startFullStack(databaseUrl) {
  console.log("Starting API and Expo.");
  const api = spawnPrefixed("api", "npm", ["run", "dev", "--workspace", "apps/api"], {
    ...process.env,
    DATABASE_URL: databaseUrl,
  });
  const mobile = spawnPrefixed("mobile", "npm", ["run", "start", "--workspace", "apps/mobile"], process.env);
  await supervise([api, mobile]);
}

async function startMockMobile() {
  const mobile = spawnPrefixed("mobile", "npm", ["run", "start", "--workspace", "apps/mobile"], {
    ...process.env,
    EXPO_PUBLIC_USE_MOCKS: "1",
  });
  await supervise([mobile]);
}

async function runRequiredCommand(command, args, env) {
  const code = await runSetupCommand(command, args, env);
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${code}`);
  }
}

function runSetupCommand(command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });
  prefixOutput(child.stdout, "setup", process.stdout);
  prefixOutput(child.stderr, "setup", process.stderr);
  return childExit(child);
}

function spawnPrefixed(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });
  prefixOutput(child.stdout, label, process.stdout);
  prefixOutput(child.stderr, label, process.stderr);
  return child;
}

async function supervise(children) {
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) {
        child.kill(signal);
      }
    }
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  const exit = await Promise.race(children.map((child) => childExit(child)));
  shutdown("SIGTERM");
  process.exitCode = exit ?? 0;
}

function childExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal === "SIGINT" || signal === "SIGTERM") {
        resolve(0);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function commandSucceeds(command, args, timeoutMs = 5_000) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "ignore",
  });
  // A hung daemon (e.g. Docker Desktop mid-startup) must not hang the probe.
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
  }, timeoutMs);
  const code = await childExit(child).catch(() => 1);
  clearTimeout(timer);
  return code === 0;
}

function prefixOutput(stream, label, target) {
  let pending = "";
  stream.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      target.write(`[${label}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (pending) {
      target.write(`[${label}] ${pending}\n`);
    }
  });
}

function friendlyError(error) {
  if (!error) {
    return "unknown error";
  }
  if (error.code === "ECONNREFUSED") {
    return "connection refused";
  }
  if (error.code === "ENOTFOUND") {
    return "host not found";
  }
  if (error.code === "ETIMEDOUT" || /timeout/i.test(error.message ?? "")) {
    return "connection timed out";
  }
  if (error.code === "28P01") {
    return "authentication failed";
  }
  if (error.code === "3D000") {
    return "database does not exist";
  }
  return error.message ?? String(error);
}

function isMissingDatabaseError(error) {
  return error?.code === "3D000";
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
