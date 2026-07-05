# UI Slice A — Search screen

Read `workflows/design-system.md` first. It is the contract. Foundation primitives
live in `apps/mobile/src/components/ui/` — compose them, never modify them or
`constants/theme.ts` / `themed-text.tsx`. If a primitive is missing a prop you need,
work around it locally and flag it in your final summary.

## Scope

- `apps/mobile/src/app/(tabs)/index.tsx` (rewrite)
- May add small screen-local components under `src/components/search/`.
- Nothing else. No git commands.

## Redesign

### Header (replaces brand mark + title + zip row)
- Eyebrow `CARTWISE` (ThemedText `eyebrow`, accent color) above the `display` title `Search`.
- Right of the title, a pressable accent `Chip` `ZIP {zip}` that calls `resetLocation()` (accessibilityLabel "Change location, currently ZIP {zip}"). Kill the separate "Change location" text button and the green square brand mark.
- Under the header, one `small` textSecondary status line: "Comparing {n} stores near {zip}" / loading / error (danger) — same logic as today.

### Search field (the hero — this screen's one bold element)
- Full-width pill: `Radii.chip` radius, `backgroundElement` bg, 1px border, 56pt tall.
  Left: magnifying-glass SymbolView (textSecondary). Middle: the TextInput
  (`body` size 17, NOT bold), placeholder "Milk, eggs, olive oil…".
  Right inside the pill: clear (✕) circle button when text present.
- Submit on return key only — drop the inline "Search" button; keep `returnKeyType="search"`.
  Keep min-2-chars rule; invalid submits do nothing.
- On focus, border color animates to `accent` (Motion.fast timing).

### Results
- Section header: eyebrow `RESULTS` + `caption` count ("{n} priced items"), replacing the current bold/plain pair.
- Result rows live in a flush `Card` (list group). Each row:
  - 48pt product thumb (`Radii.thumb`, `accentMuted` placeholder with first letter).
  - Name (`smallBold`, 1 line), meta brand · size (`caption`, textSecondary).
  - Price line: `PriceText size="sm"` (accent) + `caption` " at {store}".
  - If ≥2 stores: a deal `Chip` "Saves {formatPrice(delta)}" (delta = worst − best). This is the money moment — the ONLY orange on the row.
  - `FreshnessStamp` for the cheapest price.
  - Right side: Add `AppButton` (variant primary, size md, haptic light) or the existing `CartQuantityStepper` — keep it a SIBLING of the toggle pressable (see lessons.md: no nested buttons).
  - Chevron rotates on expand (reanimated, Motion.spring; plain swap under reduced motion).
- Expanded: store comparison as `ReceiptRow`s — cheapest first with `highlight`, others with `deltaLabel="+{formatPrice(diff)}"` vs cheapest. Pass `meta` = "{chainLabel} · {distance} mi", `capturedAt`, and promo `wasValue` when `promoPrice` is set.
- Expand/collapse animates height (reanimated layout transition; opacity-only under reduced motion).

### States
- Loading: 3 `Skeleton` rows shaped like result rows (thumb square + two lines) inside the flush Card. No spinners.
- Empty (no search yet): `EmptyState` icon `{ ios: 'magnifyingglass', android: 'search', web: 'search' }`, title "Search an item", message "One item at a time — Cartwise compares every store nearby." No action button.
- No prices: EmptyState title "No live prices found", message "Try a common name like milk, eggs, or bread."
- Errors: EmptyState with danger-appropriate copy, keep current messages.

## Quality gate

`npm run typecheck && npm run lint` in `apps/mobile` must pass. Do not run git.
Summarize what you changed and anything you had to work around.
