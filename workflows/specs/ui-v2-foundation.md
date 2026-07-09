# UI v2 Slice F — Foundation: tokens, primitives, navigation chrome

Implementer: Codex. Scope: `apps/mobile` only. Read `workflows/design-system.md` (v2, "The Yellow Tag") FIRST — it is the contract; this spec is the work order.

## Hard rules

- Touch ONLY `apps/mobile`. Never touch `apps/api`, `packages/shared`, `src/api/`, `src/state/`, or any business logic/data fetching.
- No new dependencies. `expo-linear-gradient` is already installed for you. Everything else uses existing deps (`react-native-reanimated` 4.x, `expo-symbols`, `expo-glass-effect`, `expo-haptics` via `src/lib/haptics.ts`).
- No git commands.
- No hex/rgba literals outside `src/constants/theme.ts` — the ONE exception is the translucent on-hero chip fill inside `chip.tsx` (documented below).
- `expo-symbols` `SymbolView` names must ALWAYS be the platform-map form `{ ios, android, web }`, never a bare string (bare strings render empty boxes on Android/web).
- Every animation must respect `useReducedMotion()` from `react-native-reanimated`: fall back to plain fades or static rendering.
- Existing screens must still compile and render after this slice: keep every existing exported name, prop, and color-role key. You ADD roles/variants; you never remove or rename existing ones.
- When done, run in `apps/mobile`: `npm run typecheck && npm run lint` and fix everything.

## 1. `src/constants/theme.ts`

Replace the `Colors` palettes with v2 (copy exactly from design-system.md's color table — all v1 role names keep existing, plus new roles `dealTag`, `onDealTag`, `heroSurface`, `heroSurfaceDeep`, `onHero`, `onHeroMuted`, `shadow`).

Update:
- `Radii`: `card: 20, control: 14, thumb: 12, chip: 999`, add `hero: 28`.
- `Motion`: keep `fast: 140`, `base: 240` (was 220), add `slow: 450`, add
  `springGentle: { damping: 20, stiffness: 200 }`, `springPop: { damping: 13, stiffness: 300 }`,
  and keep `spring` as an alias equal to `springGentle`.
- Add `Elevation` export:
  ```ts
  export const Elevation = {
    card: { shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
    float: { shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  } as const;
  ```
  (No `shadowColor` here — consumers add `shadowColor: theme.shadow`.)
- `BottomTabInset`: `Platform.select({ ios: 104, android: 96 }) ?? 96` (clears the new floating tab bar).
- Update the header comment to reference v2 "The Yellow Tag".

## 2. `src/components/themed-text.tsx`

- Add variant `displayXL`: Bricolage ExtraBold (`FontFamilies.displayExtraBold`), 40/44, letterSpacing -0.8.
- `display`: switch to `FontFamilies.displayExtraBold`, 34/38, letterSpacing -0.5.
- `title`: switch to `FontFamilies.displayBold`, keep 22/28, letterSpacing -0.2.
- `eyebrow`: letterSpacing 1.2 (keep size/weight/uppercase).
- Remove the hardcoded `#3c87f7` in the legacy `linkPrimary` variant — use nothing hardcoded; make it render with the default text color path (the variant is legacy; just drop its color line so the themeColor logic applies).
- Everything else unchanged.

## 3. `src/lib/motion.ts` (new)

```ts
import { FadeIn, FadeInDown } from 'react-native-reanimated';
```
Export `entrance(index: number, reducedMotion: boolean)`:
returns `(reducedMotion ? FadeIn : FadeInDown).duration(320).delay(60 * Math.min(index, 7))`.
This is the ONLY entrance animation screens use. Add a doc comment: "Section/row entrance. Cap the stagger at 8 steps; fires once per mount."

## 4. `src/components/ui/pressable-scale.tsx` (new)

`PressableScale`: an `Animated.createAnimatedComponent(Pressable)` wrapper mirroring the press behavior in `button.tsx`:
- Props: all `PressableProps` (with `style` as `StyleProp<ViewStyle>`), plus `haptic?: 'light' | 'selection' | 'none'` (default `'light'`).
- onPressIn → scale to 0.97 with `withSpring(…, Motion.springGentle)`; onPressOut → back to 1. Skip scaling entirely under reduced motion.
- Fires the haptic (via `src/lib/haptics.ts`) in `onPress` before calling through.
- No visual styling of its own; it's purely behavior.

## 5. `src/components/ui/savings-tag.tsx` (new) — THE signature component

The yellow clearance tag. Props:
```ts
type SavingsTagProps = ViewProps & {
  label: string;                       // "Saves $6.40 vs Walmart"
  size?: 'sm' | 'md';                  // default 'md'
  holeColor: ThemeColor;               // surface the tag sits on (fills the punched hole)
  stamp?: boolean;                     // play stamp-in entrance (default false)
};
```
Visual spec (exact):
- Container: `backgroundColor theme.dealTag`, borderRadius 8, transform `rotate('-2deg')`,
  paddingVertical 5 (sm: 3), paddingLeft 22 (sm: 18), paddingRight 12 (sm: 10), alignSelf 'flex-start'.
- Punched hole: absolute View, width/height 6, borderRadius 999, left 8 (sm: 6), centered vertically, `backgroundColor theme[holeColor]`.
- Label: `ThemedText type={size === 'sm' ? 'caption' : 'smallBold'}` `themeColor="onDealTag"`, numberOfLines 1.
- `stamp` entrance: shared values scale 1.2→1 and rotation -7°→-2° driven by `withSpring(…, Motion.springPop)` started in a `useEffect` on mount; under reduced motion render statically at final state.
- Accessibility: `accessibilityLabel` = label.
Doc comment: "Used ONLY for money saved. One per card, max."

## 6. `src/components/ui/animated-price-text.tsx` (new)

`AnimatedPriceText`: identical visual output to `PriceText` (reuse it for rendering), but the value counts up 0 → `value` over `Motion.slow` ms with an ease-out curve on mount, and re-animates from the previous value when `value` changes.
- Implementation: reanimated shared value + `withTiming(value, { duration: Motion.slow, easing: Easing.out(Easing.cubic) })`, bridge to JS state with `useAnimatedReaction` + `runOnJS` setState (rounding to cents), render `<PriceText value={displayValue} …/>`.
- Props: same as `PriceText`.
- Under reduced motion (or web if flaky): render the final value immediately, no animation.
- The final settled value must be EXACTLY `value` (set state to the target in the animation callback), never a float artifact.

## 7. `src/components/ui/button.tsx`

- `borderRadius: Radii.chip` for both sizes (pill buttons). `lg` minHeight 56 and paddingHorizontal `Spacing.five`.
- Press scale uses `Motion.springGentle` (rename from `Motion.spring` for clarity; alias still exists).
- No other API changes.

## 8. `src/components/ui/card.tsx`

- Radius comes from `Radii.card` (now 20). Add prop `elevated?: boolean` (default `true`).
- Light scheme + elevated: NO border (`borderWidth 0`), `Elevation.card` + `shadowColor: theme.shadow`.
- Dark scheme (or `elevated: false`): hairline border exactly as today, no shadow.
- Use the same scheme source as `useTheme` (`useColorScheme` hook from `@/hooks/use-color-scheme`).
- IMPORTANT: `overflow: 'hidden'` clips shadows on iOS — move to: outer View carries background+radius+shadow; keep `overflow: 'hidden'` only when `flush` (row groups need clipping). When flush+light, prefer radius+clipping and accept the softer shadow.
- Add prop `surface?: 'default' | 'hero'`: hero renders `expo-linear-gradient` `LinearGradient` from `theme.heroSurface` → `theme.heroSurfaceDeep` (start `{x:0,y:0}`, end `{x:1,y:1}`), radius `Radii.hero`, padding `Spacing.four`, no border, `Elevation.float` in both schemes.

## 9. `src/components/ui/chip.tsx`

- Add tone `'hero'`: background `'rgba(255,255,255,0.16)'` (the documented literal exception — on-hero translucent fill), foreground `onHero`. Type the tones map so hero's background bypasses ThemeColor (e.g. allow a raw string for this tone only, with a comment referencing design-system.md).
- Bump paddingVertical to `Spacing.one + Spacing.half` and minHeight 24 for balance. No API changes otherwise.

## 10. `src/components/ui/freshness-stamp.tsx`

- Add `inverse?: boolean` prop for hero surfaces: text renders `onHeroMuted`, status dot keeps its semantic color except the neutral state which renders `onHeroMuted`.
- No other changes; the stamp is the trust contract — never remove it from any composition.

## 11. `src/components/ui/empty-state.tsx`

- Icon now sits centered in a 64px circle: `backgroundColor theme.accentMuted`, borderRadius 999; icon tint `theme.accent`, size 28.
- The circle scales in 0.8→1 with `Motion.springPop` on mount (fade only under reduced motion).
- Title `title` variant, message `small` `textSecondary`, action button unchanged. Same API.

## 12. `src/components/app-tabs.tsx` — floating pill tab bar

Replace the default tab bar with a custom one (keep using `expo-router` `Tabs`, pass `tabBar={props => <FloatingTabBar {...props} />}` and `tabBarStyle: { display: 'none' }` is NOT needed when a custom tabBar is provided).

`FloatingTabBar` (can live in the same file or `src/components/floating-tab-bar.tsx`):
- Container: absolute, `left/right: 20`, `bottom: safeAreaInsets.bottom + 8` (use `useSafeAreaInsets`), height 64, borderRadius 999, flexDirection row, `Elevation.float` + `shadowColor theme.shadow`.
- Fill: on iOS, if `expo-glass-effect`'s `isLiquidGlassAvailable()` returns true, wrap content in `GlassView` (rounded 999, overflow hidden); otherwise a solid `theme.backgroundElement` with a hairline `theme.border` border. Android/web always solid.
- Items (4 tabs): each a Pressable filling equal width, column layout: `SymbolView` icon (size 24) + label (`caption`, weight 700). Active: tint `theme.accent`; inactive: `theme.textSecondary`.
- Active icon animation: on becoming focused, scale 1→1.15→1 via `withSpring(Motion.springPop)` (skip under reduced motion). `tapLight()` haptic on tab press.
- Cart badge: small circle (min 18px) `theme.accent` bg, `onAccent` caption text with the cart item count, absolutely positioned top-right of the cart icon; when the count changes, pop scale 0.6→1 with `springPop`. Hide when 0.
- Keep the existing icon platform maps and titles (Search / Cart / Alerts / Settings).
- Accessibility: each item `accessibilityRole="tab"`, `accessibilityState={{ selected }}`, label = title.

`src/components/app-tabs.web.tsx`: restyle the web tab bar to visually match (fixed bottom, centered pill max-width 480, same colors/radius, no glass) — keep its current structural approach; must typecheck and lint.

## 13. `src/components/ui/sticky-action-bar.tsx` (new)

`StickyActionBar` — the floating CTA dock used by Cart:
```ts
type StickyActionBarProps = {
  summary: string;            // "12 items"
  detail?: string;            // "4 stores nearby"
  actionLabel: string;        // "Find my cheapest store"
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};
```
- Absolute, `left/right: 20`, `bottom: BottomTabInset + 12` (it docks ABOVE the floating tab bar), borderRadius `Radii.hero`, padding `Spacing.three`, `backgroundColor theme.backgroundElement`, `Elevation.float` + `shadowColor theme.shadow`, hairline border in dark mode only.
- Row layout: left column (summary `smallBold`, detail `caption` `textSecondary`), right: `AppButton` primary size `md` with the actionLabel (flexShrink 0).
- Enters with `FadeInDown.duration(240)` when mounted; exiting `FadeOutDown` (plain fades under reduced motion).

## 14. Sweep

- `rg -n '#[0-9a-fA-F]{3,8}' apps/mobile/src --glob '!constants/theme.ts'` — migrate any hex literal found (e.g. `animated-icon.tsx`, `animated-icon.web.tsx`, `web-badge.tsx`, `global.css` accent vars) to v2 tokens. For `global.css`, update the CSS custom properties to the v2 light/dark values.
- The splash overlay (`animated-icon.tsx`) should end up plum-on-paper: brand mark in `accent` on `background`.

## Acceptance

- `npm run typecheck && npm run lint` pass in `apps/mobile`.
- All four tabs render with the floating bar; content scrolls under it and clears it via `BottomTabInset`.
- Existing screens (untouched in this slice) still compile against the updated primitives.
- Dark mode: cards keep hairline borders, tab bar solid or glass, palette per table.
