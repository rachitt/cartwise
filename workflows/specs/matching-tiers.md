# Matching Tiers — Phase 1 remainder (stacked on PR #40)

Goal: separate exact matches from comparable substitutes, and gate cart optimization on match confidence.

## 1. Shared types (packages/shared)

Move `ProductMatch`, `ProductMatchConfidence`, `ProductMatchMethod`, `ProductMatchSummary` from apps/api/apps/mobile into `packages/shared`. Add:

```ts
export type MatchTier = 'exact' | 'equivalent' | 'comparable' | 'none';
export interface ProductComparison { tier: MatchTier; confidence: number; reasons: string[] }
export const MIN_SWAP_CONFIDENCE = 0.6;
```

## 2. Pure scorer — apps/api/src/catalog/compare.ts

`compareProducts(a, b): ProductComparison` over Product-shaped rows. Reuse the search relevance tokenizer/normalizer and `size.ts` conversions — do not fork them.

- `exact` (confidence 1.0) only when both UPCs non-null and equal.
- Otherwise require: comparable sizes (both parseable, units convertible, qty ratio in [0.9, 1.1] after conversion). Fail → `none`.
- confidence = 0.20·categoryEqual + 0.45·sizeScore (1.0 if ratio ≥ 0.98 else 0.8) + 0.35·nameTokenJaccard (excluding brand tokens + stopwords).
- tier: `equivalent` if brands equal non-null and confidence ≥ 0.75; `comparable` if confidence ≥ 0.6; else `none`.

Must-pass tests: store-brand "Grade A Large Eggs 12ct" across two chains (different/null brand) → comparable; "Cheerios 18 oz" vs "Cheerios Cereal 18 oz" same brand → equivalent; eggs 12ct vs 18ct → none; "Olive Oil 16.9 fl oz" vs "Canola Oil 16.9 fl oz" → below 0.6 → none; eggs vs "Liquid Egg Whites" → none.

## 3. Matcher fix — cross-chain identity merges

In `upsertCollectedProduct`: accept an identity match only if the collected brand is non-null OR the existing product already has a store_product for the same chain (add a small repository lookup). Otherwise insert a new product (`new`/`inserted`). Test both paths.

## 4. Product detail comparables

`GET /products/:id/prices` response adds `comparable: Array<{ product, prices, comparison }>`: candidates from `getAlternativeProductsByCategory(category, id, storeIds, 10)`, scored with compareProducts, keep tier ≥ comparable, sort by confidence desc, cap 5. Prices = latest snapshots via `getLatestPricesForProducts` (no live collector calls), always with capturedAt. Mobile `products/[id].tsx`: "Comparable alternatives" section below existing prices — each row shows price, FreshnessStamp, and a Chip: "close match" (≥0.75) / "similar" otherwise. Follow workflows/design-system.md.

## 5. Optimizer gating

`buildAlternatives` (cart-api.ts): score each candidate with compareProducts vs the cart item's product; drop tier `none` or confidence < MIN_SWAP_CONFIDENCE; thread `matchTier`/`matchConfidence` into `SwapSuggestion` (shared type) and surface on the swap row in mobile cart results. Optimizer tests updated; add a test that a same-category low-confidence product is never suggested.

## 6. Search chip fix (PR #40 review finding)

Mobile `matchLabel`: show a chip only when `result.prices.length ≥ 2` and confidence ≠ 'unknown'; label `same item · {N} stores`. Delete 'single-store item' and 'mixed match' labels.

## Constraints

- NO git commands (sandbox). Work only in this worktree.
- Quality gate in apps/api and apps/mobile: `npm run typecheck && npm run lint && npm test` (mobile has no test script — typecheck+lint only).
- Do not touch collectors/, cache TTLs, or rate limiting.
