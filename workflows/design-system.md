# Cartwise Design System v2 — "The Yellow Tag"

Owner: Fable (design). Implementers: Codex slices. Status: v2, 2026-07-09.
Supersedes v1 "The Shelf Tag" (evergreen/paper). v1 screens migrate wholesale in the ui-v2 slices.

## Thesis

Cartwise's product is still the price — but v2's identity is the **moment you save money**.
The two artifacts we borrow from real grocery life:

1. **The yellow clearance tag.** In every US supermarket, marigold-yellow tags mean one thing:
   this costs less than you expected. In Cartwise, marigold is *earned* — it appears only where
   money is saved, and it appears as a physical tag (punched hole, slight tilt), not a pill.
2. **The receipt.** Tabular numbers, dot leaders, dashed tear lines, a timestamp. The bill
   detail screen is set like a receipt; every price carries its "as of" stamp (trust contract, unchanged).

Everything else is **plum ink on oat paper**: a deep aubergine that no US grocery brand owns
(Instacart is green, Walmart blue, Target red, Kroger blue). Premium, produce-adjacent
(eggplant, fig, plum), and it makes the marigold tag glow.

v2 also buys three things v1 didn't have:
- **Depth.** Borderless cards on soft plum-tinted shadows in light mode; the tab bar and primary
  CTAs float above content.
- **A motion identity.** Springy, orchestrated, one hero moment per screen. Money counts up.
  Tags stamp in. Lists cascade. Everything presses down 3%.
- **A hero moment.** Cart results opens with the winner: a full-color plum card, the total
  counting up in marigold, the savings tag stamping in with a success haptic.

What this is not: cream-and-serif, dark-with-acid-accent, or confetti. Restraint everywhere
except the savings reveal.

## Tokens (source of truth: `apps/mobile/src/constants/theme.ts`)

### Color roles

| Role | Light | Dark | Use |
|---|---|---|---|
| `background` | `#FAF7F1` oat paper | `#131019` | screen background |
| `backgroundElement` | `#FFFFFF` | `#1D1729` | cards, panels, tab bar |
| `backgroundSelected` | `#F2EDF7` plum wash | `#2A2138` | pressed/selected fills |
| `text` | `#241934` plum ink | `#F3EFFA` | primary text |
| `textSecondary` | `#6B6176` | `#A79FB8` | meta, captions |
| `accent` | `#53307E` plum | `#C7A9F1` lilac | brand, primary buttons, active tab |
| `accentMuted` | `#F0E9F8` | `#33254D` | selected chips, icon wells |
| `onAccent` | `#FFFFFF` | `#221636` | text/icons on `accent` fills |
| `deal` | `#8F5B00` dark amber | `#FFCE57` | savings *text* deltas only |
| `dealMuted` | `#FFF3D6` | `#3D2F14` | soft savings washes |
| `dealTag` | `#FFC53D` | `#FFC53D` | the yellow tag fill — SavingsTag ONLY |
| `onDealTag` | `#241934` | `#241934` | text on the yellow tag |
| `border` | `#E5DEEC` | `#362C4A` | hairlines, input borders |
| `danger` | `#BA3B2E` | `#F2A69E` | errors, destructive |
| `dangerMuted` | `#F9E3DF` | `#45211D` | error panel fill |
| `heroSurface` | `#43276A` | `#34215C` | the winner card + onboarding hero fills |
| `heroSurfaceDeep` | `#331C55` | `#271745` | gradient end for hero fills |
| `onHero` | `#FFFFFF` | `#FFFFFF` | primary text on hero fills |
| `onHeroMuted` | `#C9B8E4` | `#B9A6DC` | secondary text on hero fills |
| `shadow` | `#2E1D45` | `#000000` | shadowColor for elevation |

Rules (unchanged in spirit from v1, tightened):
- **No hex/rgba literals in screens.** Components in `src/components/ui/` may use
  `rgba(255,255,255, …)` overlays for on-hero chips only — documented at the call site.
- `dealTag` marigold is the single loudest thing in the app and it means **money saved**.
  Never decorative, never for state, never for brand.
- `accent` plum = brand + interactive. `heroSurface` = the one full-bleed color moment per flow.
- Danger stays quiet: text + muted fills, never full-saturation panels.

### Typography

Display face stays **Bricolage Grotesque** (already loaded per-weight in `_layout.tsx`),
but v2 leans on **ExtraBold** and tighter tracking — headlines should feel like hand-set
market signage. Body stays system (SF Pro / Roboto). Stamps stay platform mono.

`ThemedText` variants:

| Variant | Face | Size/Line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `displayXL` **(new)** | Bricolage | 40/44 | 800 | -0.8 | hero moments: winner store name, onboarding headline |
| `display` | Bricolage | 34/38 | **800** (was 700) | -0.5 | screen titles |
| `title` | Bricolage | 22/28 | **700** (was 600) | -0.2 | card titles |
| `heading` | system | 17/22 | 600 | 0 | section headings |
| `default` | system | 16/24 | 400 | 0 | copy |
| `bodyBold` | system | 16/24 | 700 | 0 | emphasized copy |
| `small` | system | 14/20 | 500 | 0 | row meta |
| `smallBold` | system | 14/20 | 700 | 0 | row titles, labels |
| `caption` | system | 12/16 | 500 | 0 | fine print |
| `eyebrow` | system | 12/16 | 700 | **1.2** + uppercase | section eyebrows |
| `stamp` | mono | 11/14 | 500 | 0 | freshness timestamps only |

Money renders through `PriceText`/`AnimatedPriceText` (superscript cents, tabular nums) —
no exceptions. `hero` size grows to 48/24 (dollars/cents).

### Shape & depth

- `Radii.card = 20`, `Radii.control = 14`, `Radii.thumb = 12`, `Radii.chip = 999`,
  `Radii.hero = 28` (new — hero cards, sheets, floating bars).
- New `Elevation` tokens (style fragments; components add `shadowColor: theme.shadow`):
  - `Elevation.card`: `shadowOpacity 0.08, shadowRadius 16, shadowOffset {0,6}, elevation 3`
  - `Elevation.float`: `shadowOpacity 0.18, shadowRadius 28, shadowOffset {0,12}, elevation 10`
- Light mode cards: **no border, Elevation.card**. Dark mode cards: keep hairline border
  (shadows don't read on dark), no elevation. `Card` handles this switch internally.

### Motion

Tokens in `theme.ts`; helpers in new `src/lib/motion.ts`.

- Durations: `Motion.fast = 140` (press, fades), `Motion.base = 240` (reveals),
  `Motion.slow = 450` (count-ups, hero entrances).
- Springs: `Motion.springGentle = { damping: 20, stiffness: 200 }` (settles, layout),
  `Motion.springPop = { damping: 13, stiffness: 300 }` (badges, tags, tab icons).
  Keep `Motion.spring` as an alias of `springGentle` for compatibility.
- **Entrance grammar:** sections/rows enter with `FadeInDown.duration(320).delay(60 * index)`,
  capped at index 7. Helper `entrance(index, reducedMotion)` in `src/lib/motion.ts` returns
  `FadeIn` (no translate) under reduced motion. Entrances fire once per mount, never on re-render.
- **Press grammar:** every tappable surface scales to 0.97 with `springGentle`
  (buttons already do; cards/rows adopt via new `PressableScale`).
- **Money grammar:** hero totals count up from 0 over `Motion.slow` with ease-out
  (`AnimatedPriceText`). List prices never animate.
- **Tag grammar:** `SavingsTag` stamps in — scale 1.2→1 with rotation -7°→-2° on `springPop`.
- One orchestrated moment per screen. Respect `useReducedMotion()` everywhere:
  reduce to opacity fades, static prices rendered immediately, no stamps.
- Haptics via `src/lib/haptics.ts` only: `tapLight` on add/steppers/tab change,
  `tapSuccess` on finalize + savings reveal, `tapSelection` on toggles.

## Signature components (`apps/mobile/src/components/ui/`)

- **`SavingsTag`** (new — THE signature). The yellow clearance tag: `dealTag` fill,
  `onDealTag` text (`smallBold`), radius 8, a punched hole (6px circle of the surface
  color, absolute left 8px, vertically centered — pass `holeColor` = card/bg the tag sits on),
  whole tag rotated **-2°**. Optional `stamp` prop plays the stamp-in animation.
  Used ONLY for money saved ("Saves $6.40"). One per card, max.
- **`PriceText`** — unchanged contract (superscript cents, tabular, sizes `sm|md|lg|hero`).
- **`AnimatedPriceText`** (new) — same visual as PriceText; counts up on mount.
  Static under reduced motion.
- **`PressableScale`** (new) — Pressable wrapper: scale 0.97 `springGentle` + optional haptic;
  cards/rows that navigate use it.
- **`AppButton`** — pills now (`borderRadius: Radii.chip`), `lg` minHeight 56.
  Variants unchanged; `primary` renders plum/lilac.
- **`Card`** — adds light-mode elevation (see depth rules), radius 20. `flush` unchanged.
- **`Chip`** — unchanged API; add tone `'hero'` (translucent white on hero fills).
  `deal` tone remains for soft savings washes; loud savings use `SavingsTag`.
- **`ReceiptRow`**, **`FreshnessStamp`** (adds `inverse` prop for hero surfaces),
  **`Skeleton`**, **`EmptyState`** (icon now sits in a 64px `accentMuted` circle) — restyled, same APIs.
- **`FloatingTabBar`** (new, `src/components/`) — detached pill tab bar: margins 20,
  radius 999, `Elevation.float`, GlassView on iOS when available (solid elsewhere).
  Active icon springs (`springPop`), cart badge pops on count change.
- **`StickyActionBar`** (new) — floating CTA bar docked above the tab bar
  (cart's "Find my cheapest store").

## Voice

Unchanged from v1: sentence case, buttons say what happens, savings language is concrete
("Saves $6.40 vs Walmart"), errors say the way out, the freshness stamp is never dropped.

## Screen grammar

- Shell: `ThemedView > SafeAreaView(top) > ScrollView`, gutter `Spacing.four`,
  `MaxContentWidth` centered, bottom padding `BottomTabInset + Spacing.five`.
  `BottomTabInset` grows to clear the floating bar (≈104 iOS / 96 Android).
- Header: brand row (wordmark "Cartwise" in Bricolage 700 17pt plum + ZIP pill right),
  then `display` title. The all-caps CARTWISE eyebrow is retired.
- Sections: `eyebrow` + count, then an elevated `Card` group.
- Rows: 44pt+ targets; chevrons only when a row navigates; rows that navigate use `PressableScale`.
- Hero moment per flow: onboarding headline, search's focused input, cart's sticky CTA,
  cart-results' winner card, alerts' price-drop tags.
