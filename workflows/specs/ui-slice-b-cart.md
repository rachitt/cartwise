# UI Slice B — Cart + results

Read `workflows/design-system.md` first. It is the contract. Foundation primitives
live in `apps/mobile/src/components/ui/` — compose them, never modify them or
`constants/theme.ts` / `themed-text.tsx`. If a primitive is missing a prop you need,
work around it locally and flag it in your final summary.

## Scope

- `apps/mobile/src/app/(tabs)/cart.tsx` (rewrite)
- `apps/mobile/src/app/cart-results.tsx` (rewrite)
- May add screen-local components under `src/components/cart/`.
- Nothing else. No git commands.

## Cart screen

- Header: eyebrow `CARTWISE`, display title `Cart`, `small` textSecondary subline
  "{n} items · compared across {m} stores".
- Items in one flush `Card`: rows with name (`smallBold`), brand · size (`caption`),
  `CartQuantityStepper` right-aligned. Remove becomes a ghost "Remove" `AppButton`
  (size md) — or swipe if trivial, otherwise keep the button. Hairline separators.
- Finalized state: accent-washed `Card` banner — `Chip` "Finalized" + `small` copy
  "Prices locked for this run." + secondary `AppButton` "Start a new cart" (`createCart`).
- Footer CTA pinned under the list: primary `AppButton` size lg, label
  **"Find my cheapest store"**, `haptic="success"`, loading ties to `finalizeCart.isPending`.
  Disabled logic unchanged. On success → `router.push('/cart-results')` (unchanged).
- Loading: `Skeleton` rows, not spinners. Error/empty: `EmptyState`
  (empty: icon cart, title "Your cart is empty", message "Add items from Search to compare store totals.",
  no action). Finalize errors: dangerMuted `Card` panel with danger `small` text.

## Cart-results screen — the payoff moment

This is the app's climax: "you save $X by going to Y." Spend the drama here.

- Top bar: ghost back control (chevron + "Cart", `router.back()`).
- **Hero card** (accent-washed `Card`, accent 1px border): eyebrow `YOUR CHEAPEST STORE`,
  `title` store name, `caption` chain label, then `PriceText size="hero"` total.
  Under it, when savings > 0: deal `Chip` "Saves {formatPrice(savings)} vs the priciest cart"
  + `FreshnessStamp capturedAt={pricesAsOf}`.
  Hero entrance: fade-up + spring settle on mount (reanimated, Motion.spring;
  opacity fade only under reduced motion). This is the screen's single orchestrated moment.
- **Store totals**: eyebrow `STORE TOTALS`; flush `Card` of `ReceiptRow`s —
  winner first with `highlight`, others with `deltaLabel="+{formatPrice(total - winningTotal)}"`,
  meta = chain label; append "· {k} items missing" to meta when the store is missing items (danger caption instead if clearer).
- **Cart items**: eyebrow `CART ITEMS`; flush `Card`, per item: name (`smallBold`),
  meta brand · size · qty (`caption`), and a neutral `Chip` "Cheaper at {store}" when
  `cheaperElsewhere` flags it.
- **Swaps**: eyebrow `SWAP SUGGESTIONS`; per swap a `Card` row: "{from} → {to}"
  (`smallBold`), reason as neutral `Chip`, saving as deal `Chip` "Save {formatPrice(x)}".
  Empty: `small` textSecondary "No strong swaps found — this cart is already tight."
- Guard states (no optimization / errors): `EmptyState` with action button
  "Back to cart" → `router.replace('/cart')`.

## Quality gate

`npm run typecheck && npm run lint` in `apps/mobile` must pass. Do not run git.
Summarize what you changed and anything you had to work around.
