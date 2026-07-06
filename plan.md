# Cartwise Product Plan

## Product Thesis

Cartwise should not be just a grocery search app. The core value is helping a shopper answer one practical question:

> Given my location and grocery list, where should I shop today to spend the least without guessing?

The app becomes meaningfully valuable when users trust three things:

- Search results are relevant to the item they asked for.
- Prices are fresh, local, and comparable across nearby stores.
- The cart optimizer explains the cheapest realistic shopping option.

## Success Criteria

- A user can set a location, search a common grocery item, and see clean, relevant, nearby price options.
- A user can compare equivalent products by unit price, not just sticker price.
- A user can build a cart and get a ranked store recommendation with savings, missing items, and freshness.
- Every displayed price includes store, distance, and captured-at context.
- The app can support repeated weekly use through saved grocery lists and price alerts.

## Phase 1: Make Search Trustworthy

Search quality is the highest priority. If the user searches for eggs and gets random grocery noise, the rest of the app loses credibility.

### Work Items

- Improve search relevance scoring so exact item/category matches rank first.
- Add query normalization for common grocery terms, pluralization, and synonyms.
- Filter or demote products whose title/category clearly does not match the requested item.
- Group similar product variants cleanly by brand, size, and pack count.
- Preserve broad recall only after clearly relevant results have been shown.

### Acceptance Criteria

- Searching `eggs` primarily returns eggs.
- Searching `milk` primarily returns milk, with clear brand and size labels.
- Searching `olive oil` does not lead with unrelated oils or pantry items.
- Results explain enough context for a user to understand what they are comparing.

## Phase 2: Add Unit Price Comparison

Raw price can be misleading. A cheaper sticker price is not always cheaper value.

### Work Items

- Normalize product sizes into comparable units where possible.
- Support common grocery units: oz, fl oz, lb, count, gallon, quart, pint, liter, each.
- Calculate unit price for every product with enough size data.
- Show unit price in product rows and price comparison rows.
- Add fallbacks for products where size parsing is incomplete.

### Acceptance Criteria

- The app can compare `12 eggs` vs `18 eggs`.
- The app can compare `1 gal milk` vs `half gal milk`.
- The app can compare oils, cereal, coffee, and other packaged goods by normalized unit.
- Unit price never appears when the app cannot calculate it confidently.

## Phase 3: Improve Cross-Store Product Matching

The app should understand comparable products even when stores use different brands or naming.

### Work Items

- Expand the catalog matcher beyond exact UPC/name matches.
- Use normalized name, category, size, unit, brand, and package count for matching.
- Separate exact same-product matches from comparable substitute matches.
- Add confidence levels for matches.
- Prevent weak matches from contaminating cart optimization.

### Acceptance Criteria

- The app can identify equivalent store-brand staples across Kroger, Target, ALDI, and future chains.
- Product detail screens distinguish exact matches from comparable alternatives.
- Cart optimization can choose cheaper comparable substitutions only when confidence is high enough.

## Phase 4: Make Whole-Cart Optimization the Main Value

Single-item comparison is useful, but whole-cart savings is the main product.

### Work Items

- Show the cheapest single-store option for the entire cart.
- Show a split-store option only when savings justify the extra trip.
- Rank stores by total price, missing items, and distance.
- Surface why a store won: total price, number of available items, freshness, and travel distance.
- Clearly show missing items so the user does not trust an incomplete cart blindly.

### Acceptance Criteria

- A finalized cart shows cheapest store, total, savings, and freshness.
- The user can see which items are missing at each store.
- Split-store recommendations are not shown unless the savings threshold is meaningful.
- The optimizer never treats stale or missing prices as real prices.

## Phase 5: Build Trust Indicators Everywhere

Price comparison apps fail when users do not trust the data.

### Work Items

- Keep `capturedAt` visible on every price row.
- Label cached or stale prices honestly.
- Show store distance everywhere a store price appears.
- Add source status summaries when a collector fails or cache is served.
- Consider a simple confidence label for price freshness and product matching.

### Acceptance Criteria

- Every price row has an as-of timestamp.
- Stale data is visible but not hidden.
- Collector errors do not create fake confidence.
- Users can tell whether a price is fresh enough to act on.

## Phase 6: Add Store Radius Controls

Savings only matter if the trip is reasonable.

### Work Items

- Add a user-controlled store radius: nearby, standard, wider search.
- Include distance and possible extra-trip cost in optimizer decisions.
- Let the user prefer single-store shopping or maximum savings.
- Default to nearby grocery stores for the simplest experience.

### Acceptance Criteria

- A user can choose how far they are willing to shop.
- Store candidates change based on that radius.
- The optimizer does not recommend a far store for tiny savings.

## Phase 7: Saved Grocery Lists

Saved lists turn Cartwise from a one-off lookup into a recurring shopping tool.

### Work Items

- Let users save common grocery lists.
- Let users rerun a saved list against current nearby prices.
- Add quick-add from prior cart items.
- Support basic list editing: quantity, remove, reorder, duplicate.

### Acceptance Criteria

- A user can save a weekly basics list.
- A user can rerun that list without rebuilding the cart.
- Saved lists use current prices, not old cart totals.

## Phase 8: Price Alerts

Alerts should focus on staples and watched products, not noisy promotions.

### Work Items

- Let users watch products or saved-list staples.
- Trigger alerts when a price drops below a user-defined threshold.
- Include store, distance, price, prior price, and freshness in the alert.
- Avoid alert spam through cooldowns and meaningful thresholds.

### Acceptance Criteria

- A user can watch eggs, milk, coffee, detergent, diapers, or other staples.
- Alerts are actionable and local.
- Alerts never fire for stale or low-confidence prices.

## Implementation Priority

1. Search relevance and result filtering.
2. Unit price normalization.
3. Cross-store product matching confidence.
4. Whole-cart optimization UX.
5. Trust indicators and stale-data handling.
6. Store radius controls.
7. Saved grocery lists.
8. Price alerts.

## Immediate Next Slice

Start with search relevance because it unlocks trust in every downstream workflow.

Recommended first PR:

- Add a search relevance layer in the API after collector results are fetched.
- Normalize query and product tokens.
- Score exact title/category matches higher than fuzzy matches.
- Filter obvious mismatches.
- Add tests for `eggs`, `milk`, and `olive oil`.
- Keep the UI flow unchanged unless the backend response shape must expose relevance metadata.

## Product Risk

Cartwise only adds significant value if price data is real, fresh, local, and comparable. Mock data or noisy search results cannot power this product. The long-term moat is not just fetching prices; it is turning messy retailer data into a trusted grocery decision.
