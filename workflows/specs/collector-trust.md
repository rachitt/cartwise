# Collector Trust — Phase 2 hardening + trust indicators

Goal: collector failures are visible (team + users), never fake confidence. Stale beats wrong.

## 1. Health registry — apps/api/src/collectors/health.ts

In-memory per-chain rolling window (last 50 outcomes): live/stale/error counts, lastSuccessAt, lastErrorAt, lastErrorMessage (strip URLs/tokens). Record outcomes inside `collectWithSource` (price-api.ts). Status: `healthy` (success in window, error rate < 25%), `degraded` (stale-serving or error rate 25–75%), `down` (no success in window). Never `healthy` without ≥1 success.

## 2. Health endpoint + alert logging

`GET /v1/health/collectors` → `{ collectors: [{ chain, status, lastSuccessAt, lastErrorAt, errorRate, sampleSize }] }`. zod-validate nothing sensitive, rate-limit like other public endpoints. On status transition to `down` log one structured `app.log.error({ alert: 'collector_down', chain })`; log recovery transition too — no per-request spam. Unit tests for transitions.

## 3. Mobile: source status banner

`sources` is already in search and product-prices responses — parse it in client.ts. New `SourceStatusBanner` (follow workflows/design-system.md): when a selected store's chain reports `error` or `stale`, show e.g. "Kroger prices may be outdated — showing last known". Mount on search results, product detail, cart results. Never blocks content; complements FreshnessStamp, never replaces it.

## 4. Distance audit

Every UI row that shows a store price must show store distance when available (reuse existing formatting). Audit and patch: cart results rows, product detail store rows, alerts rows. List audited files in the final summary.

## 5. ZIP coverage gate

`GET /v1/coverage?zip=` (zod, rate-limited): supported = ZIP resolves ≥2 stores from ≥2 distinct chains via existing store lookup. Returns `{ supported, chains, storeCount }`. Mobile onboarding: unsupported ZIP → honest "Cartwise doesn't fully cover your area yet" screen with secondary "Browse anyway" action that proceeds normally.

## Constraints

- NO git commands (sandbox). Work only in this worktree.
- Do NOT touch: catalog/matcher.ts, catalog/compare.ts, search match chips in brand-first-results.tsx (another slice owns those).
- Quality gate in apps/api and apps/mobile: `npm run typecheck && npm run lint && npm test` (mobile: typecheck+lint only).
- No new collector crawling; on failure serve cache and flag freshness, never fabricate.
