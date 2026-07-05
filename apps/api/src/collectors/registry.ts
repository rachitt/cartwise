import type { ChainSlug } from "@cartwise/shared";

import { AldiCollector } from "./aldi.js";
import { KrogerCollector } from "./kroger.js";
import { TargetCollector } from "./target.js";
import type { Collector } from "./types.js";
import { WalmartCollector } from "./walmart.js";

const collectors = new Map<ChainSlug, Collector | null>();
const warnedMissingCollectors = new Set<ChainSlug>();
const collectorStats: Record<ChainSlug, { ok: number; failed: number }> = {
  kroger: { ok: 0, failed: 0 },
  target: { ok: 0, failed: 0 },
  walmart: { ok: 0, failed: 0 },
  aldi: { ok: 0, failed: 0 },
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
    walmart: { ...collectorStats.walmart },
    aldi: { ...collectorStats.aldi },
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

  if (chain === "walmart") {
    if (process.env.WALMART_DISABLED === "1") {
      return null;
    }

    try {
      return new WalmartCollector();
    } catch (error) {
      warnMissingCollectorOnce(chain, error);
      return null;
    }
  }

  if (chain === "aldi") {
    if (process.env.ALDI_DISABLED === "1") {
      return null;
    }

    return new AldiCollector();
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
  if (!collector) {
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

async function trackCollectorCall<T>(chain: ChainSlug, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    collectorStats[chain].ok += 1;
    return result;
  } catch (error) {
    collectorStats[chain].failed += 1;
    throw error;
  }
}
