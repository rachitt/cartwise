# UI Slice C — Alerts, Settings, Product detail

Read `workflows/design-system.md` first. It is the contract. Foundation primitives
live in `apps/mobile/src/components/ui/` — compose them, never modify them or
`constants/theme.ts` / `themed-text.tsx`. If a primitive is missing a prop you need,
work around it locally and flag it in your final summary.

## Scope

- `apps/mobile/src/app/(tabs)/alerts.tsx` (rewrite)
- `apps/mobile/src/app/(tabs)/settings.tsx` (rewrite)
- `apps/mobile/src/app/products/[id].tsx` (rewrite)
- May add screen-local components under `src/components/alerts/`.
- Nothing else. No git commands.

## Alerts

- Header: eyebrow `CARTWISE`, display title `Alerts`, subline "Price drops on items you watch."
- Kill `SAVINGS_GREEN` literal and every hex.
- Permission card (not granted): `Card` with icon well (bell SymbolView on accentMuted circle),
  `heading` "Know when prices drop", `small` copy, primary `AppButton`
  "Enable price alerts" (`haptic="success"`, loading = isRegistering). Denied state keeps
  explanatory copy + settings hint.
- Recent drops: eyebrow `RECENT DROPS` + caption count. Flush `Card` rows:
  unread = 8pt accent dot leading; product name `smallBold`; store `caption`;
  price movement rendered as `PriceText size="sm" strike` (old) → `PriceText size="sm"` accent (new)
  side by side, plus a deal `Chip` "−{formatPrice(old-new)}"; relative time as `stamp`.
  Press marks read (unchanged mutation).
- Watched items: eyebrow `WATCHED ITEMS` + count. Rows: name `smallBold`,
  "baseline {formatPrice} · {n} stores" `caption`, ghost "Remove" AppButton
  (keep the native confirm Alert).
- Empty states via `EmptyState` (drops: "No price drops yet" / "You'll hear the moment a watched price falls.").
  Loading via `Skeleton` rows. Keep pull-to-refresh.

## Settings

- Header: eyebrow `CARTWISE`, display title `Settings`.
- Location `Card`: eyebrow `LOCATION`, `title` ZIP value ("Not set" fallback in textSecondary),
  secondary `AppButton` "Change location" → `resetLocation()` (moves INSIDE the card; delete the dead bottom-button styles).
- Nearby stores: eyebrow `NEARBY STORES` + caption count; flush `Card` rows:
  store name `smallBold`, meta "{chainLabel} · {distance} mi" `caption`.
  Empty fallback copy unchanged.
- Add a quiet footer: `stamp` text "Cartwise compares Kroger, Walmart, Target, and ALDI. Prices are cached briefly and always stamped."

## Product detail

- Top bar: ghost back control (chevron + "Back").
- Product header `Card`: 72pt thumb (`Radii.thumb`, accentMuted placeholder — no hex literal),
  name `title`, meta brand · size · category `caption`, and Add primary `AppButton` /
  `CartQuantityStepper` (existing logic).
- Prices: eyebrow `STORE PRICES`; flush `Card` of `ReceiptRow`s — cheapest `highlight`,
  others `deltaLabel="+{diff}"`, `wasValue` when promo, `capturedAt` always,
  meta "{chainLabel} · {distance} mi" (source fallback as today).
- Loading: `Skeleton` blocks shaped like header + three rows (replace DetailSkeleton spinner).
- Empty: `EmptyState` "No prices found nearby".

## Quality gate

`npm run typecheck && npm run lint` in `apps/mobile` must pass. Do not run git.
Summarize what you changed and anything you had to work around.
