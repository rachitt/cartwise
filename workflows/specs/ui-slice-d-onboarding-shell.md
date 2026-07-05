# UI Slice D — Onboarding, splash, app shell

Read `workflows/design-system.md` first. It is the contract. Foundation primitives
live in `apps/mobile/src/components/ui/` — compose them, never modify them or
`constants/theme.ts` / `themed-text.tsx`. If a primitive is missing a prop you need,
work around it locally and flag it in your final summary.

## Scope

- `apps/mobile/src/components/onboarding-flow.tsx` (rewrite)
- `apps/mobile/src/components/animated-icon.tsx` (retheme)
- `apps/mobile/src/components/app-tabs.tsx`, `app-tabs.web.tsx` (polish)
- Delete `src/components/hint-row.tsx` and `src/components/ui/collapsible.tsx` IF
  `rg` proves nothing imports them (check first; see lessons.md about downstream deps).
- Nothing else. Do NOT touch `_layout.tsx`. No git commands.

## Onboarding — the first impression

- Full-screen on `background`. Staged entrance (one orchestrated sequence,
  reanimated FadeInDown with small stagger; plain fades under reduced motion):
  1. Wordmark: `display` text "Cartwise" in accent.
  2. `title`-sized value line: "The same groceries cost different prices on the same street."
  3. `small` textSecondary: "Cartwise checks Kroger, Walmart, Target, and ALDI near you."
- Location `Card`: primary `AppButton` size lg "Use my location" (loading =
  resolvingLocation, label stays put — the spinner communicates), divider `caption`
  "or enter a ZIP", ZIP `TextInput` (5-digit numeric, `heading`-size type,
  `Radii.control`, border → danger on invalid, keep sanitizing), then secondary
  `AppButton` size lg "Continue" (disabled until valid).
- Inline errors keep current logic/copy, rendered `small` danger inside the card.
- All hexes go: `#ffffff` button text and `fontSize:24` input are replaced by tokens/variants.

## Splash overlay (`animated-icon.tsx`)

Currently Expo-blue with Expo logo assets — a brand mismatch, highest-visibility fix:
- Overlay background: solid Cartwise evergreen `Colors.light.accent` equivalent —
  read it from `Colors` import, not a literal. (Splash is scheme-independent; use the
  light accent.)
- Replace the Expo logo/glow images with a typographic mark: "Cartwise" in
  `FontFamilies.displayBold` (fallback-safe: fonts may not be loaded during splash —
  if the custom family isn't available yet, system bold is an acceptable fallback,
  do not crash), `onAccent` white, ~40pt, with the existing scale/fade exit animation retimed
  to Motion tokens.
- Keep the SplashScreen.hideAsync flow and reduced-motion behavior intact.
- Remove now-unused template assets from imports (leave files on disk).

## Tab bars

- Native (`app-tabs.tsx`): keep expo-router Tabs + SymbolView icons. Ensure active
  tint = `accent`, inactive = `textSecondary`, bar bg = `backgroundElement`, top border `border`.
  Badge count stays.
- Web (`app-tabs.web.tsx`): retheme to tokens (kill `#ffffff` literal); brand text uses
  `FontFamilies.displayBold`; active tab pill uses `accentMuted` + accent text instead of
  `backgroundSelected`.

## Quality gate

`npm run typecheck && npm run lint` in `apps/mobile` must pass. Do not run git.
Summarize what you changed and anything you had to work around.
