# UI v2 Slice S — Screens: every surface adopts "The Yellow Tag"

Implementer: Codex. Scope: `apps/mobile` only. Prerequisite: Slice F (foundation) is merged into this branch — the v2 tokens and primitives (`SavingsTag`, `AnimatedPriceText`, `PressableScale`, `StickyActionBar`, `FloatingTabBar`, `entrance()`) exist. Read `workflows/design-system.md` and `workflows/specs/ui-v2-foundation.md` first.

## Hard rules (same as Slice F)

- `apps/mobile` only; no changes to `src/api/`, `src/state/`, business logic, mutations, query keys, or navigation targets. This slice is presentation + motion only.
- No new dependencies, no git commands, no hex/rgba literals outside `theme.ts`.
- `SymbolView` names always platform maps `{ ios, android, web }`.
- Reduced motion: every entrance/stagger/count-up/stamp falls back to plain fade or static.
- NEVER remove a `FreshnessStamp` or an accessibility prop. Keep every `accessibilityLabel`/`Role`/`State`; update wording only if the visible label changed.
- Screen shell grammar (design-system.md): gutter `Spacing.four`, `MaxContentWidth`, bottom padding `BottomTabInset + Spacing.five` on tab screens.
- Header grammar on tab screens: replace the all-caps "CARTWISE" eyebrow with a brand row — wordmark `Cartwise` (ThemedText `title` styled 17/22 via style override is NOT allowed; instead add nothing new: use `ThemedText type="smallBold"` with `FontFamilies.displayBold` via a shared `BrandRow` header component you create once in `src/components/brand-row.tsx` and reuse) on the left in `accent`, and the screen's contextual action (e.g. ZIP pill) on the right.
- Section entrances use `entrance(index, reducedMotion)` from `src/lib/motion.ts` — sections stagger top to bottom once per mount. Do not animate on state-only re-renders (key entrances off mount, and for search results key off the submitted query signature).
- When done: `npm run typecheck && npm run lint` in `apps/mobile`, fix everything.

## 0. `src/components/brand-row.tsx` (new, shared)

Props: `{ right?: ReactNode }`. Left: "Cartwise" in `FontFamilies.displayBold`, fontSize 17, lineHeight 22, color `theme.accent`. Right slot for a contextual control. minHeight 28, row, space-between. Every tab screen opens with this.

## 1. Search — `src/app/(tabs)/index.tsx`

Layout top to bottom:
1. `BrandRow` with right = the ZIP pill (existing `Chip label="ZIP {zip}" tone="accent"` inside the existing Pressable that calls `resetLocation`).
2. `display` title "Build your cart".
3. Store status line: drop the bordered card; render as a plain row (status dot + `small` text) directly under the title — quieter than v1.
4. Search field: keep pill shape; height 64; `backgroundColor theme.backgroundElement`; NO border by default; `Elevation.card` + `shadowColor theme.shadow`; on focus animate a 2px `theme.accent` border in (existing `interpolateColor` approach is fine — from transparent to accent) and scale the field to 1.01 with `springGentle` (skip under reduced motion). Submit button: 44px circle, `theme.accent`.
5. Results section: keep all existing states (skeleton/errors/empty/brand flow) and logic exactly. Add: results/rows entrance-stagger via `entrance(i, reducedMotion)` keyed by the search signature (`submittedSearchText + storeIds`) so a new search re-cascades; empty states get their new spring circle for free.

## 2. Brand-first results — `src/components/search/brand-first-results.tsx`

Presentation-only restyle:
- Brand cards become `PressableScale` + elevated `Card`s; brand name `title`; item count + price range as `caption` `textSecondary`.
- The cheapest-brand card may show ONE `SavingsTag` (`holeColor="backgroundElement"`, size `sm`) with "Cheapest brand" replaced by a concrete delta if the data already provides one; if no concrete dollar delta exists in current props, use `Chip tone="accent"` "Cheapest brand" instead — do NOT invent numbers.
- Product rows inside a selected brand: unchanged structure; stagger rows with `entrance()`; steppers unchanged (they get the Slice F polish for free); keep every `FreshnessStamp`.
- Back-to-brands control becomes a ghost `AppButton` with a left chevron `SymbolView`.

## 3. Cart — `src/app/(tabs)/cart.tsx`

- Header: `BrandRow` (right: nothing), `display` "Cart", meta line unchanged.
- Item rows: `ProductThumb` size 52; row minHeight 80. Replace the "Remove" ghost text button with a 36px ghost icon button (`SymbolView` `{ ios: 'trash', android: 'delete', web: 'delete' }`, tint `textSecondary`, `accessibilityLabel "Remove {product name}"`).
- List choreography: wrap rows in `Animated.View` with `layout={LinearTransition.springify().damping(20).stiffness(200)}`, `exiting={FadeOut.duration(Motion.fast)}` so removals collapse smoothly (skip layout animation under reduced motion).
- THE UX CHANGE: the finalize CTA moves out of the scroll into a `StickyActionBar` (Slice F component) rendered as a sibling of the ScrollView: `summary` = "{itemCount} items", `detail` = "{activeStores.length} stores nearby", `actionLabel` = "Find my cheapest store", wired to the existing `handleFinalize`, `loading={finalizeCart.isPending}`, `disabled={finalizeDisabled}`. Only render when the cart is non-empty and not finalized. Add `Spacing.six` extra bottom padding to the scroll content when the bar is visible so nothing hides behind it.
- Finalized banner: keep behavior; restyle as elevated Card with `Chip tone="accent"` "Finalized" + copy + secondary button (as today).
- Empty/error/skeleton states unchanged in logic.

## 4. Cart results — `src/app/cart-results.tsx` — THE hero moment

This screen gets the app's one orchestrated reveal. Keep ALL data logic (ranking, `worstTotal` savings math, store/bill detail state) exactly as is; this is a re-skin + choreography pass.

Ranked view, top to bottom:
1. TopBar back control (restyle: 36px circular `backgroundSelected` chevron button + `smallBold` label).
2. Header: eyebrow "YOUR CHEAPEST STORE" in `accent`, then nothing else — the hero card carries the title.
3. **HeroBillCard** (build inline in this file): `Card surface="hero"` (plum gradient, `Radii.hero`, `Elevation.float`), wrapped in `PressableScale` → opens the winner's bill detail (`setSelectedStoreId(winner.storeId)`).
   Contents, top to bottom (gap `Spacing.two`):
   - Store name: `displayXL`, `themeColor "onHero"`, numberOfLines 2.
   - Store meta (chain · distance): `small`, `onHeroMuted`.
   - "TOTAL BILL" `eyebrow` in `onHeroMuted`, then `AnimatedPriceText value={winner.total} size="hero" color="dealTag"` — marigold counting up on plum.
   - If `savings > 0`: `SavingsTag stamp holeColor="heroSurface" label={"Saves " + formatPrice(savings) + " vs " + priciestStoreName}` — mount it ~350ms after the screen mounts (setTimeout in a useEffect, cleared on unmount) and fire `tapSuccess()` when it mounts. Under reduced motion: render immediately, static, no haptic.
   - Chips row: `Chip tone="hero"` for coverage ("11 of 12 items"), swaps, and missing count; `FreshnessStamp inverse capturedAt={winner.pricesAsOf}`.
   - Entrance: the hero card itself enters `FadeInUp.duration(Motion.base)` + scale 0.96→1 `springGentle`.
4. Section "OTHER STORES" (eyebrow + "Sorted by total bill" caption): the remaining ranked stores as elevated Cards, staggered with `entrance(i)`. Each card:
   - Left: rank number in a 28px `backgroundSelected` circle (`smallBold` `textSecondary`), store name `heading`, meta caption.
   - Right: `PriceText size="lg"`, and under it `caption` `deal` text "+{formatPrice(total - winner.total)}" vs the winner (plain text, NOT a SavingsTag — the tag belongs to the winner alone).
   - Chips: coverage neutral chip, swaps deal chip when >0, missing danger chip when >0. `FreshnessStamp` stays.
   - Whole card is `PressableScale` → its bill detail.
5. `SourceStatusBanner` stays where it is (above the list), restyled by its own file's pass.

Bill detail view (`StoreBillDetail`) — set it like a receipt:
- Header: eyebrow "ITEMIZED BILL" `accent`, store name `display`, meta line.
- Summary Card (elevated): "TOTAL BILL" eyebrow + `PriceText hero` in `accent` (no count-up here), coverage/swap chips + `FreshnessStamp`.
- Items Card: keep rows; separators become DASHED hairlines (`borderStyle: 'dashed'`, `theme.border`); line prices `PriceText sm`; swap lines keep the `deal` caption. Add a final "TOTAL" row: dashed separator above, `smallBold` "TOTAL" left, `PriceText md` right.
- Missing items section unchanged structurally.

## 5. Product detail — `src/app/products/[id].tsx`

Presentation pass: brand-row-less (it's a pushed screen) — restyled back control (same as cart-results TopBar), product image in an elevated Card (image height ~200, `contentFit="contain"`), name `title`, meta caption, then the store-price list as `ReceiptRow`s in a flush Card, cheapest row `highlight`. Stagger sections with `entrance()`. Keep all data logic and stamps.

## 6. Alerts — `src/app/(tabs)/alerts.tsx`

- Header: `BrandRow`, `display` "Alerts".
- Enable/permission card: elevated Card, icon in `accentMuted` circle (reuse EmptyState visual language), primary pill button.
- Alert rows: keep logic; price-drop rows show the drop as a `SavingsTag size="sm" holeColor="backgroundElement"` ("Down $0.80") — this is the tags' second legitimate home. Old→new prices: old as `PriceText sm strike`, new as `PriceText md color="accent"`. Keep stamps.
- Toggles: `tapSelection()` haptic (if not already), switch track colors from tokens (`trackColor={{ true: theme.accent, false: theme.border }}`, `thumbColor theme.backgroundElement`).
- Stagger sections with `entrance()`.

## 7. Settings — `src/app/(tabs)/settings.tsx`

- Header: `BrandRow`, `display` "Settings".
- Grouped flush Cards of rows: leading 36px `accentMuted` circle with a `SymbolView` (tint `accent`, size 18), row label `smallBold`, value/meta `caption` `textSecondary`, chevron only when the row navigates/acts. Rows that act are `PressableScale`.
- Keep every existing setting/action; restyle only. Footer: version/caption centered `textSecondary`.

## 8. Onboarding — `src/components/onboarding-flow.tsx`

Storyboard (staggered with `entrance()`, indexes 0..4):
1. Wordmark "Cartwise" — `title` variant, `accent`.
2. Headline — `displayXL`: "The same cart. Four different totals." (replaces the v1 sentence; two lines, let it wrap naturally).
3. Subline `small` `textSecondary`: "Cartwise checks Kroger, Walmart, Target, and ALDI near you — and finds where your whole cart is cheapest."
4. A single `SavingsTag` (static, `holeColor="background"`) with "Shoppers save at every price check" is NOT allowed — no invented numbers, no decorative tags. Skip a tag here entirely.
5. Location card: elevated Card — primary pill `lg` "Use my location" (existing busy overlay behavior; make the overlay pill-shaped to match `Radii.chip`), divider "or enter a ZIP", ZIP input (minHeight 56, radius `Radii.control`, focus animates border `border`→`accent` like the search field; keep validation/coverage logic and errors exactly), secondary `lg` "Continue".
- Unsupported-coverage card: same content/logic, elevated Card, buttons unchanged.

## 9. `src/components/source-status-banner.tsx`

Restyle to v2: neutral quiet strip — `backgroundSelected` fill, radius `Radii.control`, caption text, per-source status dots from tokens. Keep all logic and copy.

## 10. Steppers — `src/components/cart/cart-quantity-stepper.tsx` (and the legacy `src/components/cart-quantity-stepper.tsx` if still imported anywhere)

- Pill container (`Radii.chip`), `backgroundSelected` fill, 36px round +/- touch targets, qty in `smallBold` tabular.
- On qty change, bump the number: scale 1→1.25→1 `springPop` (skip under reduced motion). Haptics stay `tapLight` via existing paths.

## Acceptance

- `npm run typecheck && npm run lint` pass in `apps/mobile`.
- Every price row still shows a `FreshnessStamp` ("as of" trust contract).
- All flows work unchanged: onboarding → search → add to cart → finalize → results → bill detail; alerts enable/toggle; settings actions.
- Cart's finalize CTA is the sticky floating bar; nothing is hidden behind the tab bar on any screen.
- The cart-results reveal plays: hero enters, total counts up in marigold, savings tag stamps in with a success haptic; under reduced motion everything renders statically.
- Dark mode reviewed on every screen (hairline-bordered cards, palette per design-system.md).
