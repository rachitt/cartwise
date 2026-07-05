# Price Data Acquisition — Broad Store Coverage

Status: draft, supersedes the "add more direct collectors" framing in `own-collectors.md`.
Last verified: 2026-07-04.

## Thesis

Cartwise is not useful if it only compares Kroger plus one or two fragile scrapers. The data layer
must become provider-first:

- Broad partner/aggregator APIs for many retailers.
- Direct retailer collectors only where live probes show stable access.
- Paid data vendors for gaps while volume is low.
- Receipt/shelf-label capture as the long-term moat for Aldi, Trader Joe's, local grocers, and
  any store whose web data is blocked.

The mobile app should never care where a price came from. It should see normalized stores,
products, prices, `capturedAt`, and a freshness/source-confidence flag.

## Live Findings

- Direct Target RedSky is captcha-blocked from server-originated requests, but Target's current
  public web flow exposes enough low-volume seed coverage through non-secured preferred-store,
  public location, and CDUI product-grid endpoints. Use CDUI for ZIP-scoped product/price search
  and keep direct RedSky out of the critical path.
- Walmart public web endpoints are blocked from a server fetch. `www.walmart.com/store/finder/api`
  redirected to `/blocked` on 2026-07-04. Do not build a plain Walmart scraper.
- ALDI's old direct API path is not viable. `api.aldi.us` did not resolve on 2026-07-04, but the
  current `www.aldi.us` Instacart Storefront Pro flow creates an anonymous guest session and exposes
  ZIP-scoped storefront/search/price GraphQL data. Use it as a low-volume seed collector, not a
  broad scraping foundation.
- Instacart's unauthenticated API returned a clean `401`, which is a real partner boundary rather
  than a bot wall. It is the most important access path to pursue.
- Open Food Facts Open Prices returned data, but it is volunteer/global coverage, not reliable US
  local shelf pricing. Use it for UPC/product enrichment and community-price experiments, not the
  primary comparison feed.

## Source Ladder

1. Instacart Developer Platform / partner access
   - Why: Instacart advertises a North American catalog with 1.4B items, 1,800 banner retailers,
     85,000 store locations, and 3B daily updates.
   - Fit: best single route to "all kinds of stores".
   - Risk: public docs emphasize shoppable recipe/list links and nearby retailers; raw comparison
     price access may require partner approval or may be constrained by terms.
   - Action: apply for production access, ask explicitly for read APIs for product search,
     location-specific availability, item price, UPC/product identifiers, and allowed caching.

2. Walmart official partner APIs
   - Why: Walmart OPD/Affiliate docs describe localized price and availability by `storeId` and/or
     `zipCode`; public web scraping is blocked.
   - Fit: Walmart is table stakes for US grocery comparison.
   - Risk: may require publisher/affiliate/partner approval; Marketplace seller APIs are not the
     right product.
   - Action: pursue Walmart OPD/Affiliate access; build only against official credentials.

3. Existing direct/official seed collectors
   - Kroger official Products API remains the clean seed for Kroger-family stores.
   - Target CDUI/public-location APIs can be a monitored seed collector, not the foundation. Keep
     low-volume, cache-first, typed-failure behavior.
   - ALDI/Instacart storefront GraphQL can seed ALDI coverage for requested ZIPs/items; keep it
     cache-first, on-demand, and easy to disable because it is a public storefront integration.

4. Paid data providers as bridge coverage
   - Candidates: SerpApi/Google Shopping for broad web price discovery, SearchAPI or similar for
     Walmart-specific search, Apify/Unwrangle/ScrapingBee-style actors for Target/Instacart/Aldi
     gaps, and custom grocery data vendors if they can prove store-level freshness.
   - Use only behind a `PriceProvider` adapter with per-result provenance, cost accounting, and
     kill switches.
   - Acceptance gate: returns store-level price, product identifier/URL, location, `capturedAt` or
     observed timestamp, and enough product fields to match.

5. Receipts and shelf-label capture
   - This is the durable fallback and moat. Users can upload receipts or scan shelf labels when a
     chain is blocked or not covered.
   - Start with OCR-assisted manual confirmation for one beachhead metro and the top 100 basket
     items. Promote crowd prices only after confidence thresholds.

## Required Architecture Change

The current API is chain-collector-first:

- `ChainSlug` is a hard-coded union of four chains.
- `/stores` loops a fixed `CHAINS` array.
- `Collector.findStores()` assumes every collector owns exactly one retailer chain.

That cannot support Instacart, Google Shopping, or paid providers that return many retailers. Add a
provider layer above collectors:

```ts
interface PriceProvider {
  id: string; // "kroger", "target-redsky", "instacart", "walmart-opd", "serpapi-shopping"
  findStores(zip: string): Promise<DiscoveredStore[]>;
  searchProducts(term: string, store: StoreRef): Promise<ProviderProductResult[]>;
  getPrices(productRefs: ProductRef[], store: StoreRef): Promise<ProviderPriceResult[]>;
}

interface DiscoveredStore {
  chainSlug: string;
  chainName: string;
  externalLocationId: string;
  sourceProvider: string;
  name: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
}
```

Keep direct retailer collectors by wrapping them as `PriceProvider`s. Add new provider metadata to
price snapshots: `sourceProvider`, `sourceUrl`, `confidence`, and optional `termsTag`.

## Build Order

1. Provider abstraction
   - Replace hard-coded `CHAINS` route loop with provider registry.
   - Keep backward-compatible response shapes.
   - Make chain slugs DB-driven strings instead of a closed TypeScript union.

2. Source applications and credential slots
   - Add `.env.example` placeholders for Instacart IDP and Walmart OPD/Affiliate.
   - Add disabled-by-default provider stubs that return typed `unavailable` until credentials exist.

3. Target seed repair
   - Land the CDUI/public-location collector so the app has a second working seed source while
     partner access is pending.

4. Vendor bridge spike
   - Pick one paid provider and compare 20 canonical items across Cincinnati ZIP `45202` for
     Walmart, Target, Kroger, Aldi/Instacart, and one local/regional grocer.
   - Track cost per successful store-item price, match rate, freshness, and ToS/compliance risk.

5. Receipt/shelf-label MVP
   - Receipt upload + OCR + confirmation for store/date/items.
   - Store price observations with confidence and user/proof metadata.
   - Use community prices only as clearly labeled fallback until enough confirmations exist.

## Decision Rule

Do not spend more time on one-off scrapers until at least one broad provider path is tested. A new
direct collector is worth building only if it satisfies all of:

- Live endpoint returns JSON from server-originated requests.
- It covers product search and location-specific price, not just store discovery.
- It can be disabled without breaking the rest of the result.
- It has a clear freshness and legal/compliance stance.

## Source Links

- Instacart Developer Platform: https://company.instacart.com/business/developers
- Instacart Developer Platform docs: https://docs.instacart.com/developer_platform_api
- Instacart nearby retailers endpoint: https://docs.instacart.com/developer_platform_api/api/retailers/get_nearby_retailers
- Walmart OPD grocery introduction: https://walmart.io/docs/opd/v1/grocery-introduction
- Walmart pricing and availability realtime: https://walmart.io/docs/opd/v1/catalog-pricing-and-availability-realtime
- Walmart affiliate product lookup: https://walmart.io/docs/affiliates/v1/product-lookup
- Kroger Products API: https://developer.kroger.com/reference/api/product-api-partner
- SerpApi Google Shopping API: https://serpapi.com/google-shopping-api
- Open Food Facts API: https://openfoodfacts.github.io/openfoodfacts-server/api/
- Open Prices API: https://prices.openfoodfacts.org/api/docs
