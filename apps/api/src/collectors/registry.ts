import type { ChainSlug } from "@cartwise/shared";

import { KrogerCollector } from "./kroger.js";
import { TargetCollector } from "./target.js";
import type { Collector } from "./types.js";

const collectors = new Map<ChainSlug, Collector | null>();
const warnedMissingCollectors = new Set<ChainSlug>();

export function getCollector(chain: ChainSlug): Collector | null {
  if (collectors.has(chain)) {
    return collectors.get(chain) ?? null;
  }

  const collector = createCollector(chain);
  collectors.set(chain, collector);

  if (!collector) {
    warnMissingCollectorOnce(chain);
  }

  return collector;
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
