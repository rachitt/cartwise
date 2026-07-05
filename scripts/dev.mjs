#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
const composeOverridePath = path.join(rootDir, "docker-compose.override.yml");
const composeOverrideExamplePath = path.join(rootDir, "docker-compose.override.example.yml");
const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Pool } = apiRequire("pg");

const probeTimeoutMs = 2_000;
const dockerWaitMs = 30_000;
const shutdownGraceMs = 5_000;
const portReleaseWaitMs = 5_000;
const devServerPorts = [3000, 8081];
const localPortProbeHosts = ["127.0.0.1", "::1"];

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
      await ensureDockerComposeOverride();
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
    throw new Error("no usable Postgres was found and Docker could not start one; start Postgres/Docker or run npm run dev:mock explicitly for a mock-only UI.");
  }

  console.log(`Using Postgres from ${chosen.label}: ${redactDatabaseUrl(chosen.url)}`);
  const apiEnv = await writeApiEnv(chosen.url);
  await runSetup(apiEnv);
  await startFullStack(apiEnv);
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
  const merged = mergeApiEnv(existing, databaseUrl);
  await writeFile(apiEnvPath, merged, "utf8");
  console.log(`Wrote apps/api/.env with ${redactDatabaseUrl(databaseUrl)}.`);
  return {
    ...process.env,
    ...parseEnvText(merged),
    DATABASE_URL: databaseUrl,
  };
}

async function runSetup(env) {
  console.log("Running API migrations.");
  await runRequiredCommand("npm", ["run", "db:migrate", "--workspace", "apps/api"], env);

  console.log("Seeding API lookup data.");
  await runRequiredCommand("npm", ["run", "db:seed", "--workspace", "apps/api"], env);
}

async function startFullStack(apiEnv) {
  console.log("Starting API and Expo.");
  const api = spawnPrefixed("api", "npm", ["run", "dev", "--workspace", "apps/api"], {
    ...apiEnv,
  });
  const mobileEnv = {
    ...process.env,
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || defaultExpoApiUrl(),
  };
  console.log(`Expo API URL: ${mobileEnv.EXPO_PUBLIC_API_URL}`);
  const mobile = spawnPrefixed("mobile", "npm", ["run", "start", "--workspace", "apps/mobile"], mobileEnv);
  await supervise([api, mobile], devServerPorts);
}

function parseEnvText(envText) {
  const env = {};

  for (const rawLine of envText.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    env[match[1]] = value;
  }

  return env;
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
    detached: true,
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });
  prefixOutput(child.stdout, label, process.stdout);
  prefixOutput(child.stderr, label, process.stderr);
  return child;
}

async function supervise(children, portsToVerify) {
  let shutdownPromise = null;

  const shutdown = () => {
    if (!shutdownPromise) {
      shutdownPromise = shutdownChildren(children, portsToVerify);
    }
    return shutdownPromise;
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });

  const exit = await Promise.race(children.map((child) => childExit(child)));
  const childExitedBeforeShutdown = !shutdownPromise;
  const shutdownExit = await shutdown();
  process.exitCode = shutdownExit !== 0 ? shutdownExit : childExitedBeforeShutdown ? exit ?? 0 : 0;
}

async function shutdownChildren(children, portsToVerify) {
  for (const child of children) {
    signalChildProcessGroup(child, "SIGTERM");
  }

  const exits = Promise.allSettled(children.map((child) => childExit(child)));
  const exitedGracefully = await Promise.race([exits.then(() => true), sleep(shutdownGraceMs).then(() => false)]);

  if (!exitedGracefully) {
    for (const child of children) {
      signalChildProcessGroup(child, "SIGKILL");
    }
    await Promise.allSettled(children.map((child) => childExit(child)));
  }

  const openPorts = await waitForPortsToClose(portsToVerify, portReleaseWaitMs);
  if (openPorts.length > 0) {
    console.error(`Dev server ports still accepting connections after shutdown: ${openPorts.join(", ")}`);
    return 1;
  }

  return 0;
}

function signalChildProcessGroup(child, signal) {
  if (!isChildRunning(child) || !child.pid) {
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code === "ESRCH") {
      return;
    }

    try {
      child.kill(signal);
    } catch (fallbackError) {
      if (fallbackError?.code !== "ESRCH") {
        throw fallbackError;
      }
    }
  }
}

function isChildRunning(child) {
  return child.exitCode === null && child.signalCode === null;
}

function childExit(child) {
  if (!isChildRunning(child)) {
    return Promise.resolve(exitCodeForChild(child.exitCode, child.signalCode));
  }

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(exitCodeForChild(code, signal));
    });
  });
}

function exitCodeForChild(code, signal) {
  if (signal === "SIGINT" || signal === "SIGTERM") {
    return 0;
  }
  return code ?? 1;
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

async function ensureDockerComposeOverride() {
  try {
    await access(composeOverridePath);
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  try {
    await copyFile(composeOverrideExamplePath, composeOverridePath);
    console.log("Created docker-compose.override.yml from docker-compose.override.example.yml.");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("docker-compose.override.example.yml is missing; cannot prepare the default Postgres 5433 override.");
    }
    throw error;
  }
}

function defaultExpoApiUrl() {
  return `http://${firstLanIpv4Address()}:3000`;
}

function firstLanIpv4Address() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      const family = typeof address.family === "string" ? address.family : `IPv${address.family}`;
      if (family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return "localhost";
}

async function waitForPortsToClose(ports, maxMs) {
  const deadline = Date.now() + maxMs;
  let openPorts = await openLocalPorts(ports);

  while (openPorts.length > 0 && Date.now() < deadline) {
    await sleep(250);
    openPorts = await openLocalPorts(ports);
  }

  return openPorts;
}

async function openLocalPorts(ports) {
  const results = await Promise.all(ports.map(async (port) => ({ port, open: await canConnectToAnyLocalPort(port) })));
  return results.filter((result) => result.open).map((result) => result.port);
}

async function canConnectToAnyLocalPort(port) {
  const results = await Promise.all(localPortProbeHosts.map((host) => canConnectToLocalPort(host, port)));
  return results.some(Boolean);
}

function canConnectToLocalPort(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const finish = (open) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
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
