# Own Collectors — Spec (P4)

Goal: store, product, and price retrieval for a ZIP code **without official API credentials**, by building collectors against the retailers' own public web endpoints (the same backends their websites call). The Target RedSky collector already proves the pattern; this generalizes it and makes the read path degrade gracefully.

Non-goals: bulk crawling (forbidden by CLAUDE.md), price history backfill, new mobile UI.

## Ground rules (all slices)

- Everything downstream of `Collector` (routes, cache, matcher, DB, optimizer, mobile) stays collector-agnostic. No route or schema changes except the additive `sources` metadata in Slice B.
- On-demand only, always through `cache.withCache`. Per-source token-bucket rate limit (default 1 req/s, burst 5).
- Stale beats wrong: serve expired cache with a freshness flag when a collector fails; never fabricate; every price keeps `capturedAt`.
- Unofficial endpoints can change or block at any time. Every collector must fail as a typed `CollectorError`, never an unhandled throw, and every chain must be disableable via `<CHAIN>_DISABLED=1`.
- Codex implements against **mocked fetch fixtures** (sandbox has no network). Live endpoint verification happens at review time via curl (Fable/user).
- Tests: vitest, injected `fetch`, no real network in tests. Run `npm run typecheck && npm run lint && npm test` in `apps/api` before handoff.

## Slice A — shared collector HTTP layer

New file `apps/api/src/collectors/http.ts` (+ `http.test.ts`). Nothing else changes; adoption by existing collectors is a later cleanup.

```ts
export interface CollectorHttpOptions {
  chain: ChainSlug;
  fetch?: typeof fetch;            // injectable for tests
  now?: () => number;              // injectable clock for rate limiter/backoff tests
  rateLimit?: { perSecond: number; burst: number };  // default { perSecond: 1, burst: 5 }
  timeoutMs?: number;              // default 8000
  maxRetries?: number;             // default 2 (on 429/5xx/network only)
  headers?: Record<string, string>; // merged over defaults
}

export function createCollectorHttp(options: CollectorHttpOptions): CollectorHttp;

export interface CollectorHttp {
  getJson<T>(url: string, init?: { headers?: Record<string, string> }): Promise<T>;
}
```

Behavior:

1. **Token bucket** per instance: capacity `burst`, refill `perSecond`. When empty, wait (don't reject).
2. **Timeout** via `AbortController`.
3. **Retries**: only on 429, 5xx, and network errors; exponential backoff with jitter, honor `Retry-After` when present. 4xx (except 429) never retries.
4. **Error mapping** → `CollectorError(chain, kind)`: 401/403 → `auth`; 429 → `rate-limit`; other non-2xx and network/timeout → `upstream`; invalid JSON → `parse`.
5. **Default headers**: realistic desktop-browser `User-Agent` (single constant), `Accept: application/json`.

Tests must cover: rate-limit waiting (fake timers), retry-on-429 honoring Retry-After, no-retry-on-403, timeout → `upstream`, JSON parse failure → `parse`, header merging.

## Slice B — graceful degradation on the read path

Files: `apps/api/src/cache.ts`, `apps/api/src/routes/price-api.ts` (+ tests). Motivation: today a single collector failure on a cold cache 500s the whole `/stores` response, violating "stale beats wrong".

1. Extend the cache so callers can distinguish freshness:

```ts
export interface CacheResult<T> { value: T; fresh: boolean; capturedAt: Date }
export interface Cache {
  withCache<T>(key, ttlSeconds, fn): Promise<T>;                  // unchanged, keep for compat
  withCacheMeta<T>(key, ttlSeconds, fn): Promise<CacheResult<T>>; // new
}
```

`withCacheMeta` semantics: fresh hit → `{ fresh: true, capturedAt: <stored at> }`; miss + fn ok → fresh; miss/expired + fn throws + stale entry exists → `{ fresh: false, capturedAt: <stored at> }`; nothing at all → rethrow. Requires storing `createdAt` alongside the payload (add to cache entry payload envelope, not a DB migration — wrap payload as `{ v, storedAt }` with backward-compat read of bare payloads).

2. `/stores`, `/search`, `/products/:id/prices`: wrap **each chain/store collector call** in try/catch. One chain failing must not affect the others. Add an additive `sources` field to each response:

```ts
sources: Array<{
  chain: ChainSlug;
  status: "live" | "stale" | "error" | "unavailable";  // unavailable = no collector configured/disabled
  capturedAt?: string;   // ISO, present for live/stale
}>
```

3. Status codes: 200 whenever **at least one** chain produced data (live or stale) — or when the response is legitimately empty (e.g. no results for the query). 503 with `{ error, sources }` only when every configured chain errored and no cache exists. Never 500 for a collector failure.
4. Existing consumers must not break: `stores`, `results`, `prices` keys keep their exact shapes (mobile ignores unknown keys).
5. Tests: chain A ok + chain B throws → 200 with B `error`; all throw, cold cache → 503; all throw, warm-expired cache → 200 with `stale` + old `capturedAt`; `sources` reflects disabled collectors as `unavailable`.

## Slice C — Target: self-healing web key

File: `apps/api/src/collectors/target.ts` (+ tests). The hardcoded `DEFAULT_TARGET_API_KEY` is stale → RedSky returns 403. RedSky's `key` is a **public web key embedded in target.com's own JS**; fetch it instead of hardcoding.

1. `resolveWebKey()`: GET `https://www.target.com/` (browser-ish headers), extract the key with tolerant regexes — try, in order: `"apiKey":"([a-f0-9]{40})"`, `key=([a-f0-9]{40})`, `"key":"([a-f0-9]{40})"`. Cache the resolved key in-memory with a 24 h TTL.
2. Key precedence: `options.apiKey` → `TARGET_API_KEY` env → cached scraped key → scrape now. Keep the current hardcoded key only as a last-resort fallback.
3. On any RedSky 403: invalidate the cached key, re-scrape once, retry the request once with the new key. Second 403 → `CollectorError("auth")`.
4. Add a stable `visitor_id` param (random 32-hex generated once per process) — RedSky endpoints expect it.
5. Constructor must **not** throw when no key is configured anymore (scraping is the default path).
6. Tests (mocked fetch): key extracted from a fixture HTML snippet for each regex variant; 403 → re-scrape → retry-once success; 403 twice → auth error; env key skips scraping; scrape failure + no fallback → auth error.

## Slice D — Aldi collector + registry generalization

Files: new `apps/api/src/collectors/aldi.ts` (+ test), `apps/api/src/collectors/registry.ts`.

ALDI's own storefront exposes an **anonymous JSON API** (no key). Expected contracts — verify shapes against `fixtures/` provided in the worktree; the code must tolerate missing fields (all optional-chained, skip malformed items):

- Stores by ZIP: `GET https://api.aldi.us/v1/service-points?latitude=&longitude=&...` — but ZIP-based lookup goes through their location search. Implement as: `GET https://api.aldi.us/v1/service-points/search?zipCode={zip}&serviceType=pickup&limit=8`. Map: `id` → `externalLocationId`, `name`, address parts → single `address` string, `zip`, `lat`, `lng`.
- Product search: `GET https://api.aldi.us/v1/product-search?currency=USD&serviceType=pickup&q={term}&limit=24&servicePoint={externalLocationId}`. Map each item: `sku` → `externalProductId`, `name`, `brandName` → `brand`, `sellingSize` → `sizeRaw`, no UPC (null), `categoryName` → `category`, first asset URL → `imageUrl`, `price.amountRelevant` (cents → dollars) → `price`, `price.wasPriceRelevant` present ⇒ current is promo (`promoPrice = amountRelevant`, `price = wasPriceRelevant`), `capturedAt = new Date()`.
- `getPrices(ids, loc)`: `GET .../v1/products/{sku}?servicePoint={loc}&serviceType=pickup` per id (sequential, through the Slice A rate limiter).

Use `createCollectorHttp` from Slice A. Registry changes:

- `collectorStats` covers all four `ChainSlug`s; `wrapCollector`/`trackCollectorCall` generalized to any chain (no hardcoded union).
- `createCollector`: every chain honors `<CHAIN>_DISABLED=1` (KROGER_DISABLED, TARGET_DISABLED, ALDI_DISABLED, WALMART_DISABLED); `aldi` → `new AldiCollector()`.
- If the live API shape differs at review time, fixtures get updated and mapping adjusted in the same PR — structure the parsing as small pure `parseStore(json)` / `parseProduct(json)` functions to make that cheap.

## Slice E — Walmart collector (stretch, last)

File: new `apps/api/src/collectors/walmart.ts` (+ test), registry entry (registry already generalized by Slice D).

Honest expectation: walmart.com sits behind PerimeterX bot protection; a plain server fetch may get challenge pages. The slice is still worth building because the store locator frequently works and the failure mode is clean.

- Store locator: `GET https://www.walmart.com/store/finder/api/stores?singleLineAddr={zip}&distance=25` → map `id`, `displayName`, address fields, `geoPoint`.
- Product search: `GET https://www.walmart.com/orchestra/snb/graphql/Search/...` is volatile; instead target the lighter typeahead/search JSON if fixtures confirm it. If every product path is challenge-gated at review time, ship **stores-only**: `searchProducts`/`getPrices` throw `CollectorError("upstream", "walmart products blocked")` — Slice B then reports the chain as `error` while stores still work.
- Detect challenge responses (HTML instead of JSON, or `px-` markers) → `CollectorError("upstream")`, never `parse`.
- Ships default-enabled but trivially killable via `WALMART_DISABLED=1`.

## Kroger stance (no slice)

kroger.com is Akamai-protected; scraping it is poor ROI. The existing **official** Kroger collector stays primary — the developer key is free to register. Do not build an unofficial Kroger collector for now.

## Rollout

| Wave | Slices | Parallel? | Depends on |
|------|--------|-----------|------------|
| 1 | A (http), B (degrade), C (target key) | yes — disjoint files | — |
| 2 | D (aldi + registry) | solo | A merged |
| 3 | E (walmart) | solo | A + D merged |

Each slice: own worktree under `.worktrees/`, branch `codex/<slice>` from `staging`, Codex codes (no git commands), Fable reviews, quality gate, PR into `staging`. After Wave 2 merges, smoke-test live: `curl "localhost:3000/stores?zip=45202"` should return Target + Aldi stores with `sources` showing per-chain status, then `/search?q=milk&storeIds=...` returns real prices with `capturedAt`.

## Risk notes

- These are unofficial endpoints; retailers may change or block them. Mitigations are structural: typed errors, per-chain isolation (Slice B), kill switches, tiny on-demand volumes through cache TTLs.
- The RedSky key scrape (Slice C) reads target.com HTML — brittle by nature, hence three regex fallbacks + env override + old key fallback.
- Volume stays trivially low by design: reads only on user action, 24 h store TTL, 6 h search TTL.
