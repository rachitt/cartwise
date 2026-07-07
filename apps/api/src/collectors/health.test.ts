import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCollectorHealthReport,
  recordCollectorOutcome,
  resetCollectorHealth,
  sanitizeErrorMessage,
} from "./health.js";

describe("collector health registry", () => {
  beforeEach(() => {
    resetCollectorHealth();
  });

  afterEach(() => {
    resetCollectorHealth();
  });

  it("logs down and recovery transitions once", () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };

    recordCollectorOutcome("kroger", "error", new Error("upstream failed"), logger);
    recordCollectorOutcome("kroger", "error", new Error("still failed"), logger);
    recordCollectorOutcome("kroger", "live", undefined, logger);
    recordCollectorOutcome("kroger", "live", undefined, logger);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      { alert: "collector_down", chain: "kroger" },
      "Collector is down",
    );
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      { alert: "collector_recovered", chain: "kroger", status: "degraded" },
      "Collector recovered",
    );
  });

  it("never reports healthy without a live success", () => {
    recordCollectorOutcome("target", "stale", new Error("failed"));

    const target = getCollectorHealthReport().find((report) => report.chain === "target");

    expect(target).toMatchObject({
      status: "down",
      errorRate: 0,
      sampleSize: 1,
    });
  });

  it("marks stale serving as degraded after a live success", () => {
    recordCollectorOutcome("walmart", "live", undefined, undefined, new Date("2026-07-04T12:00:00Z"));
    recordCollectorOutcome(
      "walmart",
      "stale",
      new Error("GET https://example.test?token=secret failed"),
      undefined,
      new Date("2026-07-04T13:00:00Z"),
    );

    const walmart = getCollectorHealthReport().find((report) => report.chain === "walmart");

    expect(walmart).toMatchObject({
      status: "degraded",
      lastSuccessAt: "2026-07-04T12:00:00.000Z",
      lastErrorAt: "2026-07-04T13:00:00.000Z",
      sampleSize: 2,
    });
  });

  it("sanitizes URLs and token-like parameters", () => {
    expect(
      sanitizeErrorMessage(
        new Error("GET https://api.example.test/products?token=secret Bearer abc123 failed"),
      ),
    ).toBe("GET [url] Bearer [redacted] failed");
  });
});
