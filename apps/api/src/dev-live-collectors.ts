import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AldiCollector } from "./collectors/aldi.js";
import type { Collector } from "./collectors/types.js";
import { KrogerCollector } from "./collectors/kroger.js";
import { TargetCollector } from "./collectors/target.js";
import { WalmartCollector } from "./collectors/walmart.js";

loadLocalEnv();

const zip = process.env.SMOKE_ZIP ?? "45202";
const query = process.env.SMOKE_QUERY ?? "milk";
const chainSlugs = (process.env.SMOKE_CHAINS ?? "kroger,target,aldi")
  .split(",")
  .map((chain) => chain.trim().toLowerCase())
  .filter(Boolean);

interface SmokeTarget {
  label: string;
  collector: Collector;
}

const targets = createTargets();

if (targets.length === 0) {
  console.error("No live collectors are configured for SMOKE_CHAINS.");
  process.exit(1);
}

let failures = 0;

for (const target of targets) {
  console.log(`\n== ${target.label} (${zip}, "${query}") ==`);

  try {
    const stores = await target.collector.findStores(zip);
    console.log(`stores: ${stores.length}`);

    const firstStore = stores[0];
    if (!firstStore) {
      console.log("no stores returned");
      failures += 1;
      continue;
    }

    console.log(`first store: ${firstStore.name} [${firstStore.externalLocationId}]`);

    const products = await target.collector.searchProducts(query, firstStore.externalLocationId);
    const pricedProducts = products.filter((product) => product.price !== null);
    console.log(`products: ${products.length}; priced: ${pricedProducts.length}`);

    for (const product of pricedProducts.slice(0, 5)) {
      const effectivePrice = product.promoPrice ?? product.price;
      console.log(`- ${product.name}: $${effectivePrice?.toFixed(2)} as of ${product.capturedAt.toISOString()}`);
    }

    if (pricedProducts.length === 0) {
      failures += 1;
    }
  } catch (error) {
    failures += 1;
    console.error(error instanceof Error ? error.message : error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}

function createTargets(): SmokeTarget[] {
  const smokeTargets: SmokeTarget[] = [];

  for (const chain of chainSlugs) {
    try {
      if (chain === "kroger") {
        smokeTargets.push({ label: "Kroger", collector: new KrogerCollector() });
        continue;
      }

      if (chain === "target") {
        smokeTargets.push({ label: "Target", collector: new TargetCollector() });
        continue;
      }

      if (chain === "walmart") {
        smokeTargets.push({ label: "Walmart", collector: new WalmartCollector() });
        continue;
      }

      if (chain === "aldi") {
        smokeTargets.push({ label: "ALDI", collector: new AldiCollector() });
        continue;
      }

      console.warn(`Skipping unknown chain "${chain}"`);
    } catch (error) {
      console.warn(
        `Skipping ${chain}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return smokeTargets;
}

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = unquoteEnvValue(rawValue);
  }
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
