/**
 * Cartwise design tokens — v2 "The Yellow Tag" system.
 * Spec: workflows/design-system.md. Screens never use hex literals;
 * every color, radius, and duration comes from here.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#241934',
    textSecondary: '#6B6176',
    background: '#FAF7F1',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F2EDF7',
    accent: '#53307E',
    accentMuted: '#F0E9F8',
    onAccent: '#FFFFFF',
    deal: '#8F5B00',
    dealMuted: '#FFF3D6',
    dealTag: '#FFC53D',
    onDealTag: '#241934',
    border: '#E5DEEC',
    danger: '#BA3B2E',
    dangerMuted: '#F9E3DF',
    heroSurface: '#43276A',
    heroSurfaceDeep: '#331C55',
    onHero: '#FFFFFF',
    onHeroMuted: '#C9B8E4',
    shadow: '#2E1D45',
  },
  dark: {
    text: '#F3EFFA',
    textSecondary: '#A79FB8',
    background: '#131019',
    backgroundElement: '#1D1729',
    backgroundSelected: '#2A2138',
    accent: '#C7A9F1',
    accentMuted: '#33254D',
    onAccent: '#221636',
    deal: '#FFCE57',
    dealMuted: '#3D2F14',
    dealTag: '#FFC53D',
    onDealTag: '#241934',
    border: '#362C4A',
    danger: '#F2A69E',
    dangerMuted: '#45211D',
    heroSurface: '#34215C',
    heroSurfaceDeep: '#271745',
    onHero: '#FFFFFF',
    onHeroMuted: '#B9A6DC',
    shadow: '#000000',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Display face is Bricolage Grotesque, loaded per-weight in `_layout.tsx`
 * via expo-font (custom fonts do not synthesize weights — pick the family
 * that carries the weight you want).
 */
export const FontFamilies = {
  displaySemiBold: 'BricolageGrotesque_600SemiBold',
  displayBold: 'BricolageGrotesque_700Bold',
  displayExtraBold: 'BricolageGrotesque_800ExtraBold',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radii = {
  /** Cards, panels, list groups */
  card: 20,
  /** Buttons, inputs, steppers */
  control: 14,
  /** Product thumbnails */
  thumb: 12,
  /** Pills and chips */
  chip: 999,
  /** Hero cards, sheets, and floating bars */
  hero: 28,
} as const;

const springGentle = { damping: 20, stiffness: 200 } as const;

export const Motion = {
  /** Micro feedback: press scale, chip fades */
  fast: 140,
  /** Standard transitions: row expand, section reveals */
  base: 240,
  /** Count-ups and hero entrances */
  slow: 450,
  /** Settles and layout changes */
  springGentle,
  /** Badges, tags, and active tab icons */
  springPop: { damping: 13, stiffness: 300 },
  /** Compatibility alias for the gentle spring. */
  spring: springGentle,
} as const;

export const Elevation = {
  card: {
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  float: {
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 104, android: 96 }) ?? 96;
export const MaxContentWidth = 800;
