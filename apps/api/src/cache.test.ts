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
      payload: { fresh: true },
      expiresAt: new Date("2026-07-04T12:01:30Z"),
    });
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
