import type { ChainSlug } from "@cartwise/shared";

export type CollectorOutcome = "live" | "stale" | "error";
export type CollectorHealthStatus = "healthy" | "degraded" | "down";

export interface CollectorHealthReport {
  chain: ChainSlug;
  status: CollectorHealthStatus;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  errorRate: number;
  sampleSize: number;
}

interface CollectorHealthState {
  outcomes: Array<{ outcome: CollectorOutcome; at: Date }>;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  lastStatus?: CollectorHealthStatus;
}

interface CollectorHealthLogger {
  error(payload: Record<string, unknown>, message?: string): void;
  info?(payload: Record<string, unknown>, message?: string): void;
}

const CHAINS: ChainSlug[] = ["kroger", "target", "walmart", "aldi"];
const MAX_OUTCOMES = 50;
const DOWN_ALERT = "collector_down";
const RECOVERY_ALERT = "collector_recovered";

const healthByChain = new Map<ChainSlug, CollectorHealthState>();

export function recordCollectorOutcome(
  chain: ChainSlug,
  outcome: CollectorOutcome,
  error?: unknown,
  logger?: CollectorHealthLogger,
  now: Date = new Date(),
): CollectorHealthReport {
  const state = getState(chain);
  const previousStatus = state.lastStatus;

  state.outcomes.push({ outcome, at: now });
  if (state.outcomes.length > MAX_OUTCOMES) {
    state.outcomes.splice(0, state.outcomes.length - MAX_OUTCOMES);
  }

  if (outcome === "live") {
    state.lastSuccessAt = now;
  }

  if (outcome === "error" || outcome === "stale") {
    state.lastErrorAt = now;
    state.lastErrorMessage = sanitizeErrorMessage(error);
  }

  const report = toReport(chain, state);
  state.lastStatus = report.status;

  if (report.status === "down" && previousStatus !== "down") {
    logger?.error({ alert: DOWN_ALERT, chain }, "Collector is down");
  } else if (previousStatus === "down" && report.status !== "down") {
    logger?.info?.(
      { alert: RECOVERY_ALERT, chain, status: report.status },
      "Collector recovered",
    );
  }

  return report;
}

export function getCollectorHealthReport(): CollectorHealthReport[] {
  return CHAINS.map((chain) => toReport(chain, getState(chain)));
}

export function resetCollectorHealth(): void {
  healthByChain.clear();
}

export function sanitizeErrorMessage(error: unknown): string | null {
  if (error === undefined || error === null) {
    return null;
  }

  const rawMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const withoutUrls = rawMessage.replace(/https?:\/\/\S+/gi, "[url]");
  const withoutBearer = withoutUrls.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  const withoutSecrets = withoutBearer.replace(
    /\b(token|access_token|refresh_token|api[_-]?key|client_secret|password)=([^&\s]+)/gi,
    "$1=[redacted]",
  );

  return withoutSecrets.slice(0, 240);
}

function getState(chain: ChainSlug): CollectorHealthState {
  const existing = healthByChain.get(chain);
  if (existing) {
    return existing;
  }

  const state: CollectorHealthState = {
    outcomes: [],
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
  };
  healthByChain.set(chain, state);
  return state;
}

function toReport(chain: ChainSlug, state: CollectorHealthState): CollectorHealthReport {
  const sampleSize = state.outcomes.length;
  const liveCount = state.outcomes.filter((outcome) => outcome.outcome === "live").length;
  const staleCount = state.outcomes.filter((outcome) => outcome.outcome === "stale").length;
  const errorCount = state.outcomes.filter((outcome) => outcome.outcome === "error").length;
  const errorRate = sampleSize === 0 ? 0 : errorCount / sampleSize;

  return {
    chain,
    status: statusForWindow(liveCount, staleCount, errorRate),
    lastSuccessAt: state.lastSuccessAt ? state.lastSuccessAt.toISOString() : null,
    lastErrorAt: state.lastErrorAt ? state.lastErrorAt.toISOString() : null,
    errorRate,
    sampleSize,
  };
}

function statusForWindow(
  liveCount: number,
  staleCount: number,
  errorRate: number,
): CollectorHealthStatus {
  if (liveCount === 0) {
    return "down";
  }

  if (staleCount > 0 || errorRate >= 0.25) {
    return "degraded";
  }

  return "healthy";
}
