import { describe, expect, it, vi } from "vitest";

import { createCache, type CacheDb } from "./cache.js";
import type { CacheEntry } from "./db/repository.js";

describe("createCache", () => {
  it("returns a fresh cached payload without calling the loader", async () => {
    const now = new Date("2026-07-04T12:00:00Z");
    const db = fakeCacheDb({
      key: "fresh",
      payload: { ok: true },
      expiresAt: new Date("2026-07-04T12:05:00Z"),
    });
    const loader = vi.fn(async () => ({ ok: false }));

    await expect(createCache(db, () => now).withCache("fresh", 60, loader)).resolves.toEqual({
      ok: true,
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it("refetches and stores an expired payload", async () => {
    const now = new Date("2026-07-04T12:00:00Z");
    const db = fakeCacheDb({
      key: "expired",
      payload: { old: true },
      expiresAt: new Date("2026-07-04T11:59:00Z"),
    });

    await expect(
      createCache(db, () => now).withCache("expired", 90, async () => ({ fresh: true })),
    ).resolves.toEqual({ fresh: true });
    expect(db.entry).toEqual({
      key: "expired",
      payload: { v: { fresh: true }, storedAt: "2026-07-04T12:00:00.000Z" },
      expiresAt: new Date("2026-07-04T12:01:30Z"),
    });
  });

  it("deduplicates concurrent misses for the same key", async () => {
    const now = new Date("2026-07-04T12:00:00Z");
    const db = fakeCacheDb(null);
    let resolveLoader: (value: { ok: true }) => void = () => {
      throw new Error("Loader did not start");
    };
    let loaderStart: () => void = () => {};
    const loaderStarted = new Promise<void>((resolve) => {
      loaderStart = resolve;
    });
    const loader = vi.fn(async () => {
      loaderStart();
      return new Promise<{ ok: true }>((resolve) => {
        resolveLoader = resolve;
      });
    });

    const cache = createCache(db, () => now);
    const first = cache.withCacheMeta("same", 60, loader);
    const second = cache.withCacheMeta("same", 60, loader);

    await loaderStarted;
    expect(loader).toHaveBeenCalledTimes(1);
    resolveLoader({ ok: true });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { value: { ok: true }, fresh: true, capturedAt: now },
      { value: { ok: true }, fresh: true, capturedAt: now },
    ]);
  });

  it("returns stale payload when the loader fails", async () => {
    const db = fakeCacheDb({
      key: "stale",
      payload: { stale: true },
      expiresAt: new Date("2026-07-04T11:59:00Z"),
    });

    await expect(
      createCache(db, () => new Date("2026-07-04T12:00:00Z")).withCache("stale", 60, async () => {
        throw new Error("upstream failed");
      }),
    ).resolves.toEqual({ stale: true });
  });

  it("returns metadata for a fresh cached payload", async () => {
    const now = new Date("2026-07-04T12:00:00Z");
    const storedAt = new Date("2026-07-04T11:55:00Z");
    const db = fakeCacheDb({
      key: "fresh",
      payload: { v: { ok: true }, storedAt: storedAt.toISOString() },
      expiresAt: new Date("2026-07-04T12:05:00Z"),
    });
    const loader = vi.fn(async () => ({ ok: false }));

    await expect(createCache(db, () => now).withCacheMeta("fresh", 60, loader)).resolves.toEqual({
      value: { ok: true },
      fresh: true,
      capturedAt: storedAt,
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it("returns stale metadata when the loader fails after expiry", async () => {
    const storedAt = new Date("2026-07-04T11:55:00Z");
    const db = fakeCacheDb({
      key: "stale",
      payload: { v: { stale: true }, storedAt: storedAt.toISOString() },
      expiresAt: new Date("2026-07-04T11:56:00Z"),
    });

    await expect(
      createCache(db, () => new Date("2026-07-04T12:00:00Z")).withCacheMeta(
        "stale",
        60,
        async () => {
          throw new Error("upstream failed");
        },
      ),
    ).resolves.toEqual({
      value: { stale: true },
      fresh: false,
      capturedAt: storedAt,
    });
  });

  it("reads legacy bare payloads through withCache and withCacheMeta", async () => {
    const now = new Date("2026-07-04T12:00:00Z");
    const db = fakeCacheDb({
      key: "legacy",
      payload: { legacy: true },
      expiresAt: new Date("2026-07-04T12:05:00Z"),
    });

    await expect(createCache(db, () => now).withCache("legacy", 300, async () => ({}))).resolves.toEqual(
      { legacy: true },
    );
    await expect(
      createCache(db, () => now).withCacheMeta("legacy", 300, async () => ({})),
    ).resolves.toEqual({
      value: { legacy: true },
      fresh: true,
      capturedAt: new Date("2026-07-04T12:00:00Z"),
    });
  });

  it("rethrows loader errors when nothing is cached", async () => {
    const db = fakeCacheDb(null);

    await expect(
      createCache(db).withCache("missing", 60, async () => {
        throw new Error("upstream failed");
      }),
    ).rejects.toThrow("upstream failed");
  });
});

function fakeCacheDb(initialEntry: CacheEntry | null): CacheDb & { entry: CacheEntry | null } {
  return {
    entry: initialEntry,
    async getCacheEntry(key) {
      return this.entry?.key === key ? this.entry : null;
    },
    async setCacheEntry(key, payload, expiresAt) {
      this.entry = { key, payload, expiresAt };
    },
  };
}
