# UI Slice E — Brand-first search flow

Read `workflows/design-system.md` first. Compose the foundation primitives in
`apps/mobile/src/components/ui/` (including the new `ProductThumb`); never modify
foundation files or `constants/theme.ts` / `themed-text.tsx`.

## Product change (user-requested flow)

Searching an item no longer dumps a flat product list. The flow becomes:

1. User searches "milk" → **Stage 1: brand list.** Every brand available across
   the nearby stores, one row per brand.
2. User taps a brand → **Stage 2: brand comparison.** That brand's products with
   their store-by-store price comparison shown expanded.

## Scope

- `apps/mobile/src/app/(tabs)/index.tsx`
- New components under `src/components/search/` as needed.
- Client-side only: regroup the existing `/search` response by `product.brand`.
  No API or query changes. No git commands.

## Stage 1 — brand list

- Local state: `selectedBrand: string | null` (null = stage 1). Reset it on a new
  search submit and on clear.
- Group priced results by `product.brand`. Products with a null/empty brand group
  under "Other brands", ordered last; otherwise order brands by their lowest
  effective price, cheapest first.
- Section header: eyebrow `BRANDS` + caption "{n} brands".
- Brand rows live in one flush `Card`. Each row (44pt+, chevron on the right,
  whole row pressable → stage 2):
  - `ProductThumb` (48pt) from the brand's first product that has an image.
  - Brand name (`smallBold`), caption "{k} product{s}".
  - Price line: "from" caption + `PriceText size="sm"` (accent) = the brand's
    lowest effective price anywhere.
  - When the brand's products span ≥2 stores: deal `Chip`
    "Saves {formatPrice(maxSavings)}" where maxSavings is the largest
    (worst − best) spread among the brand's products.
- Add-to-cart does NOT appear on stage 1 — choosing a brand comes first.

## Stage 2 — brand comparison

- Header row replaces the results header: ghost back control ("‹ All brands",
  returns to stage 1, preserves the search) + brand name as `heading` +
  caption "{k} products".
- One `Card` per product of the brand: product header (ProductThumb 48pt, name
  `smallBold`, size/meta `caption`, `AddToCartControl`/stepper as sibling —
  keep the no-nested-buttons rule), then the store comparison **always expanded**:
  `ReceiptRow` per store, cheapest first with `highlight`, others with
  `deltaLabel="+{diff}"`, `wasValue` on promos, `capturedAt` always.
  The user chose this brand to compare stores — no extra tap.
- Entrance: stage transition animates (reanimated FadeIn/layout, Motion tokens,
  reduced-motion → plain fades).

## States

- Loading/empty/error states unchanged from today (skeletons, EmptyStates).
- A brand with prices at only one store still lists in stage 1 (no savings chip)
  and shows its single ReceiptRow in stage 2.
- If a new search returns results while in stage 2, snap back to stage 1.

## Quality gate

`npm run typecheck && npm run lint` in `apps/mobile` must pass. Do not run git.
Report files changed, implementation summary, gate output, and any workarounds.
