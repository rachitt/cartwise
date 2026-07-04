import type { CacheEntry } from "./db/repository.js";

export interface CacheDb {
  getCacheEntry(key: string): Promise<CacheEntry | null>;
  setCacheEntry(key: string, payload: unknown, expiresAt: Date): Promise<void>;
}

export interface Cache {
  withCache<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
}

export function createCache(db: CacheDb, now: () => Date = () => new Date()): Cache {
  return {
    async withCache<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
      const entry = await db.getCacheEntry(key);
      const currentTime = now();

      if (entry && entry.expiresAt > currentTime) {
        return entry.payload as T;
      }

      try {
        const payload = await fn();
        const expiresAt = new Date(currentTime.getTime() + ttlSeconds * 1_000);
        await db.setCacheEntry(key, payload, expiresAt);
        return payload;
      } catch (error) {
        if (entry) {
          return entry.payload as T;
        }

        throw error;
      }
    },
  };
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const { cartwiseDb } = await import("./db/repository.js");
  return createCache(cartwiseDb).withCache(key, ttlSeconds, fn);
}
