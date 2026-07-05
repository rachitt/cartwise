# Cartwise Design System — "The Shelf Tag"

Owner: Fable (design). Implementers: Codex slices. Status: v1, 2026-07-05.

## Thesis

Cartwise's product is the price. So the price is the identity. Every visual decision
borrows from the two artifacts grocery shoppers already trust: the **shelf tag**
(big dollars, raised cents, unit price in small print) and the **receipt**
(tabular numbers, dot leaders, a timestamp). The palette is grocer evergreen on
warm paper; the single loud color is a deal-tag orange used **only** where money
is saved. Everything else stays quiet.

What this is not: Instacart green-on-white, cream-and-serif, or dark-with-acid-accent.
The memorability comes from the price typography and receipt vernacular, not the hue.

## Tokens (source of truth: `apps/mobile/src/constants/theme.ts`)

### Color roles

| Role | Light | Dark | Use |
|---|---|---|---|
| `background` | `#FAF9F6` warm paper | `#0E1411` | screen background |
| `backgroundElement` | `#FFFFFF` | `#181F1A` | cards, panels, list groups |
| `backgroundSelected` | `#ECEFEA` | `#232C25` | pressed/selected fills |
| `text` | `#1B2620` evergreen ink | `#E9F0E9` | primary text |
| `textSecondary` | `#5F6D64` | `#9CAAA0` | meta, captions |
| `accent` | `#175E3E` evergreen | `#5FC98E` | brand, primary buttons, best price |
| `accentMuted` | `#E6F2E8` mint wash | `#173626` | best-price row wash, brand chips |
| `onAccent` | `#FFFFFF` | `#0B2417` | text/icons on `accent` fills |
| `deal` | `#B0540C` deal-tag orange | `#F0A05C` | savings deltas, price drops — NOTHING else |
| `dealMuted` | `#FBEEDD` | `#3A2A18` | savings chip fill |
| `border` | `#E3E7E0` | `#2A332C` | hairlines, input borders |
| `danger` | `#B3261E` | `#F2B8B5` | errors, destructive |
| `dangerMuted` | `#F9E2E0` | `#42201E` | error panel fill |

Rules:
- **No hex literals in screens or components.** Every color comes from `useTheme()`.
  (The old code hardcoded `#16a34a` spinners and `#ffffff` button text — all of that migrates to tokens.)
- `deal` orange is earned: it marks money saved (savings deltas, price-drop alerts, swap wins). Never decorative.
- `accent` marks the brand and the winning price. If everything is green, nothing is.

### Typography

Display face: **Bricolage Grotesque** (`@expo-google-fonts/bricolage-grotesque`, loaded in `_layout.tsx`).
Body face: system (SF Pro / Roboto) — native feel, zero load cost. Stamps: platform mono.

`ThemedText` variants (use these, never raw fontSize):

| Variant | Face | Size/Line | Weight | Use |
|---|---|---|---|---|
| `display` | Bricolage | 32/36, -0.5 tracking | 700 | screen titles |
| `title` | Bricolage | 22/28 | 600 | hero/card titles |
| `heading` | system | 17/22 | 600 | section headings |
| `body` (`default`) | system | 16/24 | 400 | copy |
| `bodyBold` | system | 16/24 | 700 | emphasized copy |
| `small` | system | 14/20 | 500 | row meta |
| `smallBold` | system | 14/20 | 700 | row titles, labels |
| `caption` | system | 12/16 | 500 | fine print |
| `eyebrow` | system | 12/16, +0.8 tracking, uppercase | 700 | section eyebrows ("RECENT DROPS") |
| `stamp` | mono | 11/14 | 500 | freshness timestamps only |

All money uses `fontVariant: ['tabular-nums']` — handled by `PriceText`, never hand-rolled.

### Shape, space, motion

- Radii tokens: `Radii.card = 16`, `Radii.control = 12`, `Radii.chip = 999`, `Radii.thumb = 10` (product images).
- Spacing: existing `Spacing` scale (2/4/8/16/24/32/64). Screen gutter = `Spacing.four` (24). Card padding = `Spacing.three` (16).
- Motion tokens: `Motion.fast = 140ms`, `Motion.base = 220ms`, spring `{ damping: 18, stiffness: 220 }`.
- One orchestrated moment per screen, not scattered effects. Respect `useReducedMotion()` from reanimated: reduce to opacity fades.
- Haptics via `src/lib/haptics.ts` only (`tapLight` on add/steppers, `tapSuccess` on finalize/enable-alerts, `selection` on toggles). No raw `expo-haptics` imports in screens.

## Signature components (source: `apps/mobile/src/components/ui/`)

Built by Fable in the foundation PR. Screens compose these; do not fork them.

- **`PriceText`** — the shelf tag. Tabular dollars with raised superscript cents
  (`$3` big, `49` small and raised, like a shelf label). Sizes `sm|md|lg|hero`.
  Props: `value` (number), `size`, `color` (ThemeColor), `strike` (was-price).
  Every price in the app renders through this. No exceptions.
- **`ReceiptRow`** — the receipt line. Left block (store name + meta), dotted leader
  rule, right-aligned `PriceText`. `highlight` prop applies the `accentMuted` wash +
  "Best price" chip. Used for store-price comparisons (search expand, product detail,
  cart results store totals).
- **`Chip`** — pill label. `tone: 'accent' | 'deal' | 'neutral' | 'danger'`.
  Deal chips carry savings ("Saves $1.20"). Accent chips carry state ("Best price", "ZIP 45202").
- **`AppButton`** — `variant: 'primary' | 'secondary' | 'ghost' | 'danger'`,
  `size: 'md' | 'lg'`, `loading`, press-scale 0.97 + haptic built in. Min touch 44pt.
- **`Card`** — surface container, `Radii.card`, hairline border, no shadow by default.
- **`FreshnessStamp`** — mono stamp with a leading status dot: accent dot when
  captured <6h ago, neutral <48h, danger outline when unknown/stale. Wraps
  `formatFreshnessStamp`. Every price row shows one (backend rule: stale beats wrong —
  the UI's job is honesty about age).
- **`Skeleton`** — shimmer block (reanimated loop; plain block under reduced motion).
  Loading states use skeletons shaped like the content, never bare spinners.
- **`EmptyState`** — SF Symbol icon + title + message + optional action `AppButton`.
  Empty states direct ("Search an item" → focuses input), never apologize.

## Voice

- Sentence case everywhere. Buttons say exactly what happens: "Find my cheapest store", "Enable price alerts".
- Savings language is concrete: "Saves $1.20 vs Walmart", never "Great deal!".
- Errors say what happened and the way out: "Live prices are unavailable. Showing cached prices from 2 hr ago."
- The freshness stamp is never hidden or dropped — it is the trust contract.

## Screen grammar

Every tab screen: `ThemedView > SafeAreaView(top) > ScrollView`, gutter `Spacing.four`,
`MaxContentWidth` centered, bottom padding `BottomTabInset + Spacing.five`.
Header pattern: `eyebrow` ("CARTWISE" or section context) over `display` title, actions right-aligned.
Section pattern: `eyebrow` heading + count, then a `Card` group of rows.
Rows: 44pt+ touch targets, chevrons only when a row navigates.
