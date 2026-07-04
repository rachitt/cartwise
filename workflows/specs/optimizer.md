# Cart Optimizer Engine — Spec (P2)

Pure function, no I/O, lives in `apps/api/src/optimizer/optimize.ts`. Codex implements against this spec with exhaustive unit tests; the finalize route feeds it data and persists nothing about its internals.

## Input

```ts
interface OptimizerInput {
  items: Array<{ productId: string; qty: number }>;
  /** Every known price for the cart's products at the user's selected stores. */
  prices: StorePrice[];            // from @cartwise/shared
  stores: Store[];                 // the user's selected stores only
  /** Same-category alternatives for swap suggestions, keyed by cart productId. */
  alternatives: Record<string, Array<{ product: Product; prices: StorePrice[] }>>;
}
```

## Rules

1. **Effective price** = `promoPrice ?? price`.
2. **Per-store totals**: for each selected store, total = Σ qty × effective price of each item **available there**; items with no price at that store go to `missingItems`. A store missing >30% of cart items (by count) is excluded from winning but still reported.
3. **Winning store** = lowest total among stores with ≥70% coverage, tie-break: fewer missingItems, then alphabetical store name (determinism).
4. **Savings baseline** = highest total among reported (≥70% coverage) stores. `savings = worstTotal - winningTotal`, floored at 0.
5. **Cheaper elsewhere**: for each cart item, if some other selected store beats the winning store's effective price by ≥ $0.30 AND ≥ 5%, emit a flag with the per-unit delta. Max 1 flag per item (the best one).
6. **Swap suggestions**: for each cart item, consider alternatives in the same category at the winning store; compute unit price (effective price / sizeQty, only when both have parseable size in the same normalized unit); suggest the best alternative that saves ≥ $0.50 on the line (qty × unit-price diff × item size). reason = 'cheaper-brand' if brand differs, else 'better-unit-price'. Max 1 suggestion per item; never suggest the item itself.
7. **pricesAsOf** = oldest `capturedAt` among prices actually used in the winning-store computation.
8. Output = `CartOptimization` from `@cartwise/shared`, all money values rounded to cents (avoid float drift: compute in integer cents internally).

## Edge cases that must have tests

- Item priced at only one store (drives missingItems + coverage exclusion).
- All stores below coverage threshold → fall back to the store with the highest coverage (then lowest total); never return "no answer" for a non-empty cart.
- Empty cart → throw a typed error (route returns 400).
- promoPrice = 0 must not be treated as free/falsy anywhere.
- qty > 1 multiplies both totals and swap-savings math.
- Ties in totals resolve deterministically (same input → same output).
- Sizes in different units (oz vs lb) — convert only within known conversions (oz↔lb, ml↔l, floz↔gal); otherwise skip unit-price comparison.
