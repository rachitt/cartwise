import type { ChainSlug } from "@cartwise/shared";

import { KrogerCollector } from "./kroger.js";
import { TargetCollector } from "./target.js";
import type { Collector } from "./types.js";

const collectors = new Map<ChainSlug, Collector | null>();
const warnedMissingCollectors = new Set<ChainSlug>();
const collectorStats = {
  kroger: { ok: 0, failed: 0 },
  target: { ok: 0, failed: 0 },
};

export type CollectorStats = typeof collectorStats;

export function getCollector(chain: ChainSlug): Collector | null {
  if (collectors.has(chain)) {
    return collectors.get(chain) ?? null;
  }

  const collector = wrapCollector(createCollector(chain));
  collectors.set(chain, collector);

  if (!collector) {
    warnMissingCollectorOnce(chain);
  }

  return collector;
}

export function getCollectorStats(): CollectorStats {
  return {
    kroger: { ...collectorStats.kroger },
    target: { ...collectorStats.target },
  };
}

function createCollector(chain: ChainSlug): Collector | null {
  if (chain === "target") {
    if (process.env.TARGET_DISABLED === "1") {
      return null;
    }

    return new TargetCollector();
  }

  if (chain === "kroger") {
    try {
      return new KrogerCollector();
    } catch (error) {
      warnMissingCollectorOnce(chain, error);
      return null;
    }
  }

  return null;
}

function warnMissingCollectorOnce(chain: ChainSlug, error?: unknown): void {
  if (warnedMissingCollectors.has(chain)) {
    return;
  }

  warnedMissingCollectors.add(chain);
  const reason = error instanceof Error ? `: ${error.message}` : "";
  console.warn(`No configured collector for chain "${chain}"${reason}`);
}

function wrapCollector(collector: Collector | null): Collector | null {
  if (!collector || (collector.chain !== "kroger" && collector.chain !== "target")) {
    return collector;
  }

  const chain = collector.chain;
  return {
    chain,
    findStores: (...args) => trackCollectorCall(chain, () => collector.findStores(...args)),
    searchProducts: (...args) => trackCollectorCall(chain, () => collector.searchProducts(...args)),
    getPrices: (...args) => trackCollectorCall(chain, () => collector.getPrices(...args)),
  };
}

async function trackCollectorCall<T>(chain: "kroger" | "target", fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    collectorStats[chain].ok += 1;
    return result;
  } catch (error) {
    collectorStats[chain].failed += 1;
    throw error;
  }
}
