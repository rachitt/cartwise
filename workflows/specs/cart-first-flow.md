# Cart-First Flow — the wedge revamp

New UX: the user never picks stores and never sees prices while building a cart. Prices appear once, at the end, as a total bill per store. Flow: ZIP → search item → pick brand/variant → add to cart (no price, no store) → repeat → "Find my store" → ranked store totals → pick store → itemized bill.

## 1. Onboarding: ZIP only

Remove the store picker step entirely. After ZIP entry (keep coverage gate from collector-trust spec), the app automatically uses ALL covered stores within the default radius as the candidate set. Kill user-facing `selectedStoreIds` selection; a `useNearbyStores` query derives the store set from ZIP via the existing stores endpoint and feeds it to search/cart calls. Grep for every consumer of the old selected-store state (see lessons.md #14) and update all of them.

## 2. Search: brand picking, price-blind

Search results show product name, brand, size/unit, image, match chip — NO prices, NO store names, NO unit-price labels. Add-to-cart is the only action. Backend search behavior unchanged (collectors still fetch/cache prices on search; the UI simply does not render them). Remove the price/store columns from brand-first results; keep relevance ordering.

## 3. Cart building: price-blind list

Cart screen shows items with image, brand, size, qty stepper, remove. No prices, no running total. Primary CTA: "Find my store".

## 4. Optimization results: total bill per store

On finalize, optimizer runs against the auto-derived nearby store set. Results screen = ranked store cards, sorted by total: store name, distance, TOTAL BILL, savings vs the most expensive ranked store, "N of M items" coverage, substitution count, FreshnessStamp (oldest capturedAt used). Cheapest card visually leads ("winner" treatment per workflows/design-system.md). Per-item pricing at each store: exact/equivalent match price when present; else comparable substitution >= MIN_SWAP_CONFIDENCE (counts as substitution, marked); else missing item.

## 5. Store bill detail

Tapping a store card opens the itemized bill: each line = product (or substituted product, clearly marked "swap: <name>"), qty, line price, FreshnessStamp per price row. Missing items listed at the bottom. This is the ONLY place per-item prices render.

## API changes (minimal)

Extend the optimizer/finalize response so EVERY ranked store carries an itemized bill: `lines: Array<{ productId, substitutedProductId?, qty, unitPrice, lineTotal, capturedAt }>` plus existing totals/missing/coverage. Reuse compare.ts tiers for substitution pricing; never price an item off a tier-none match. zod-validate anything new. No collector changes.

## Constraints

- NO git commands. Work only in this worktree.
- Every rendered price row keeps a FreshnessStamp; stale shown honestly.
- Do not touch alerts/watches, collectors, or health/coverage endpoints.
- Quality gate: apps/api `npm run typecheck && npm run lint && npm test`; apps/mobile `npm run typecheck && npm run lint`. Fix failures.
- Finish with: files changed, quality gate tails, spec deviations.
