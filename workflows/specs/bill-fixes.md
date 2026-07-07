# Bill/Results Fixes — 3 bugs from web-flow verification

1. **Ranking:** On the store-totals screen, stores below the optimizer coverage threshold (or with zero priced lines) must sort BELOW all covered stores and never show "Cheapest total"/savings badges. Sort covered stores by total asc, then uncovered by coverage desc. Savings baselines must exclude uncovered stores.
2. **Freshness:** When a store has no priced lines, do not render an epoch-0 "as of 20642 days ago" stamp — omit the stamp or show "no prices" honestly. Root-cause where the 1970 timestamp comes from (likely min/oldest over an empty array) and guard it API-side too if that's the source.
3. **Missing items:** Bill detail must show the product NAME for missing items, never a raw/mangled product id. Thread product names into missingItems (API: return {productId, name} or resolve names client-side from cart items).

Constraints: NO git commands; work only in this worktree; quality gate in apps/api (typecheck && lint && test) and apps/mobile (typecheck && lint); add a regression test for the epoch-0 pricesAsOf and for ranking exclusion. Finish with: files changed, gate tails, deviations.
