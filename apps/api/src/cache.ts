import type { CacheEntry } from "./db/repository.js";

export interface CacheDb {
  getCacheEntry(key: string): Promise<CacheEntry | null>;
  setCacheEntry(key: string, payload: unknown, expiresAt: Date): Promise<void>;
}

export interface CacheResult<T> {
  value: T;
  fresh: boolean;
  capturedAt: Date;
  error?: unknown;
}

export interface Cache {
  withCache<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
  withCacheMeta?<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<CacheResult<T>>;
}

export type CacheWithMeta = Cache & {
  withCacheMeta<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<CacheResult<T>>;
};

const inFlightByDb = new WeakMap<CacheDb, Map<string, Promise<CacheResult<unknown>>>>();

export function createCache(
  db: CacheDb,
  now: () => Date = () => new Date(),
): CacheWithMeta {
  async function withCacheMeta<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
  ): Promise<CacheResult<T>> {
    const entry = await db.getCacheEntry(key);
    const currentTime = now();

    if (entry && entry.expiresAt > currentTime) {
      const cached = readCachePayload<T>(entry, ttlSeconds);
      return { value: cached.value, fresh: true, capturedAt: cached.storedAt };
    }

    const inFlight = getInFlightMap(db);
    const pending = inFlight.get(key) as Promise<CacheResult<T>> | undefined;
    if (pending) {
      return pending;
    }

    const load = (async (): Promise<CacheResult<T>> => {
      const value = await fn();
      const expiresAt = new Date(currentTime.getTime() + ttlSeconds * 1_000);
      await db.setCacheEntry(key, { v: value, storedAt: currentTime.toISOString() }, expiresAt);
      return { value, fresh: true, capturedAt: currentTime };
    })().catch((error: unknown) => {
      if (!entry) {
        throw error;
      }

      const cached = readCachePayload<T>(entry, ttlSeconds);
      const result: CacheResult<T> = { value: cached.value, fresh: false, capturedAt: cached.storedAt };
      Object.defineProperty(result, "error", { value: error, enumerable: false });
      return result;
    });

    inFlight.set(key, load as Promise<CacheResult<unknown>>);

    try {
      return await load;
    } finally {
      if (inFlight.get(key) === load) {
        inFlight.delete(key);
      }
    }
  }

  return {
    async withCache<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
      const result = await withCacheMeta(key, ttlSeconds, fn);
      return result.value;
    },

    withCacheMeta,
  };
}

function getInFlightMap(db: CacheDb): Map<string, Promise<CacheResult<unknown>>> {
  const existing = inFlightByDb.get(db);
  if (existing) {
    return existing;
  }

  const inFlight = new Map<string, Promise<CacheResult<unknown>>>();
  inFlightByDb.set(db, inFlight);
  return inFlight;
}

function readCachePayload<T>(
  entry: CacheEntry,
  ttlSeconds: number,
): { value: T; storedAt: Date } {
  if (isCacheEnvelope(entry.payload)) {
    return { value: entry.payload.v as T, storedAt: toDate(entry.payload.storedAt) };
  }

  return {
    value: entry.payload as T,
    storedAt: new Date(entry.expiresAt.getTime() - ttlSeconds * 1_000),
  };
}

function isCacheEnvelope(value: unknown): value is { v: unknown; storedAt: string | Date } {
  if (!value || typeof value !== "object" || !("v" in value) || !("storedAt" in value)) {
    return false;
  }

  const storedAt = (value as { storedAt: unknown }).storedAt;
  return (
    (typeof storedAt === "string" || storedAt instanceof Date) &&
    !Number.isNaN(toDate(storedAt).getTime())
  );
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const { cartwiseDb } = await import("./db/repository.js");
  return createCache(cartwiseDb).withCache(key, ttlSeconds, fn);
}

export async function withCacheMeta<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<CacheResult<T>> {
  const { cartwiseDb } = await import("./db/repository.js");
  return createCache(cartwiseDb).withCacheMeta(key, ttlSeconds, fn);
}
