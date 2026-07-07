# Cartwise Product Plan

## Product Thesis

Cartwise should not be just a grocery search app. The core value is helping a shopper answer one practical question:

> Given my location and grocery list, where should I shop today to spend the least without guessing?

The app becomes meaningfully valuable when users trust three things:

- Search results are relevant to the item they asked for.
- Prices are fresh, local, and comparable across nearby stores.
- The cart optimizer explains the cheapest realistic shopping option.

## Strategy: Wedge vs. Moat

- **The wedge (what we market):** one killer moment — build a grocery list, get a ranked store answer: "ALDI wins, $18.40 cheaper, missing 2 items." One screen, screenshot-friendly, quantified savings. Everything else is supporting cast.
- **The moat (what we build):** the data layer under it — cross-store product matching with confidence, fresh local price collection, and honest staleness handling. The optimizer UI is clonable in a weekend; the matching catalog and collector reliability are not.
- **The flywheel:** demonstrable savings → shareable content → users → "wrong match / stale price" reports → better matching data → more trustworthy answers.

## Status

Shipped to staging:

- Search relevance and result filtering (plan Phase 1) — relevance scoring, normalization, mismatch filtering.
- Unit price comparison (plan Phase 2) — normalized units, unit price on product and comparison rows.
- Nearby store filtering (part of the old radius phase).
- Brand-first search flow, product images, mock data layer removed, mobile UI refresh.

In flight:

- **PR #40 (`codex/match-confidence` → staging):** product match confidence + price row layout fix. This is the core of cross-store matching — land it, then finish the remainder below.

Not started: cart optimizer, trust indicators, radius controls, saved lists, price alerts, all go-to-market work.

## Phase 0: Validate the Marketing Engine (do this week, before heavy build investment)

Every comparable app that worked validated the distribution channel before scaling the build.

### Work Items

- VSC test: find 10+ TikTok/Reels videos on grocery price comparison / "where I shop to save money"; check for 100K+ views from accounts under 5K followers (content drives reach, not the creator).
- Read comments on those videos for "what app is this?" intent — that is the convertibility signal.
- Mine competitor reviews (Flipp, Basket postmortem, store apps, App Store "grocery price compare" results); extract complaints into a feature checklist and content angles.

### Acceptance Criteria

- A documented go / no-go: both virality and convertibility signals confirmed before Phases 2+ get major investment.
- A list of competitor complaints mapped to Cartwise features or content hooks.

## Phase 1: Finish Cross-Store Matching (completes old Phase 3, after PR #40)

### Work Items

- Expand the catalog matcher beyond exact UPC/name matches using normalized name, category, size, unit, brand, and pack count.
- Separate exact same-product matches from comparable substitute matches.
- Prevent weak matches from contaminating cart optimization.

### Acceptance Criteria

- Equivalent store-brand staples identified across Kroger, Target, and ALDI.
- Product detail distinguishes exact matches from comparable alternatives.
- Cart optimization only uses substitutions above a confidence threshold.

## Phase 2: Collector Hardening + Trust Indicators (old Phase 5, promoted)

A broken scraper at launch kills trust permanently. This lands before the optimizer ships publicly.

### Work Items

- Failure alerting when a collector breaks or serves cache.
- Keep `capturedAt` visible on every price row; label cached or stale prices honestly.
- Show store distance everywhere a store price appears.
- Source status summaries when a collector fails.
- Constrain launch coverage honestly: 3 chains done well in overlapping metros beats 6 half-working; gate the app to zip codes where coverage is real.

### Acceptance Criteria

- Every price row has an as-of timestamp; stale data visible, never hidden.
- Collector failures alert the team and never create fake confidence in the UI.
- Users can tell whether a price is fresh enough to act on.

## Phase 3: The Wedge — Whole-Cart Optimization (old Phase 4 + launch surface)

### Work Items

- Cheapest single-store option for the entire cart; split-store only when savings justify the extra trip.
- Rank stores by total price, missing items, distance; surface why a store won.
- Clearly show missing items.
- **Savings receipt:** a shareable "Cartwise saved you $X this week/month" summary card — the recurring content asset and retention hook.
- **Feedback flywheel:** one-tap "wrong match / stale price" reporting on every price row; reports feed the matching backlog.

### Acceptance Criteria

- A finalized cart shows cheapest store, total, savings, freshness, and missing items on one shareable screen.
- Split-store recommendations only appear above a meaningful savings threshold.
- The optimizer never treats stale or missing prices as real.
- Mis-match reports flow into a reviewable queue.

## Phase 4: Pre-Launch Distribution (parallel with Phase 3)

### Work Items

- Create and warm up TikTok + Instagram accounts (1–2 weeks of activity before posting product content).
- Waitlist landing page; target a few hundred signups pre-launch.
- DM outreach to 5–10 micro-influencers in budgeting / frugal-living / couponing niches.
- Prepare content format candidates: "POV: weekly grocery run" with the app picking the store; receipt-comparison videos; "$X saved this month" recaps. Soft-sell; conversion happens in comments.

### Acceptance Criteria

- Accounts warmed, waitlist live, at least 5 influencer conversations started before launch day.

## Phase 5: Launch + Content Volume

### Work Items

- Launch free (no paywall): priority is installs, App Store reviews, and match-quality feedback.
- Post 1–3x/day on one channel (short-form video) so attribution stays trivial; iterate hooks until one converts, then remake the winner ~50x; optionally hire UGC creators to copy the format.
- ASO: target "grocery price comparison" / "compare grocery prices" keywords.

### Acceptance Criteria

- One content format with demonstrated conversion (comment intent + install spikes).
- Review volume and rating strong enough to serve as the ASO asset.

## Phase 6: Store Radius Controls (remainder of old Phase 6)

### Work Items

- User-controlled radius: nearby, standard, wider.
- Include distance / extra-trip cost in optimizer decisions; prefer single-store vs. max-savings toggle.

### Acceptance Criteria

- Store candidates change with radius; the optimizer never recommends a far store for tiny savings.

## Phase 7: Saved Grocery Lists

### Work Items

- Save common lists; rerun a saved list against current nearby prices; quick-add from prior carts; basic editing.

### Acceptance Criteria

- A weekly basics list reruns without rebuilding the cart, using current prices.

## Phase 8: Price Alerts + Monetization (month 3+)

### Work Items

- Watch products or saved-list staples; alert below a threshold with store, distance, price, prior price, freshness; cooldowns against spam.
- **Freemium split:** free = single-item comparison; paid ($3–5/mo or ~$30/yr — users are price-sensitive) = full cart optimizer, price alerts, saved lists. Framing: "a few dollars for hundreds in savings."
- Longer-term revenue hedge: affiliate / retail-media (store pickup links) so revenue is not solely subscriptions from frugal users.
- Expand chain coverage based on user zip-code demand, not ambition.

### Acceptance Criteria

- Alerts are actionable, local, and never fire on stale or low-confidence prices.
- Paywall ships only after content engine and retention are proven.

## Implementation Priority

1. Phase 0 demand validation (this week — cheapest de-risk available).
2. Land PR #40, finish matching (Phase 1).
3. Collector hardening + trust indicators (Phase 2).
4. Cart optimizer wedge + savings receipt + feedback reporting (Phase 3).
5. Pre-launch distribution (Phase 4, parallel with 3).
6. Launch + content volume (Phase 5).
7. Radius, saved lists, alerts + monetization (Phases 6–8).

## Product Risk

Cartwise only adds significant value if price data is real, fresh, local, and comparable. Mock data or noisy search results cannot power this product. The long-term moat is not just fetching prices; it is turning messy retailer data into a trusted grocery decision.

Two added risks to manage explicitly:

- **Collector fragility:** ALDI guest sessions and Target public APIs can break or block at any time; the product's promise dies when they do. Alerting, honest stale labels, and constrained coverage are the mitigations — treat collector maintenance as a permanent tax, not a one-off.
- **Price-sensitive monetization:** users are by definition trying to save money. Launch free, monetize only after the savings receipt proves quantified value, and keep the paid price low relative to demonstrated savings.
