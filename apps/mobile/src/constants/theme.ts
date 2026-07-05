/**
 * Cartwise design tokens — "The Shelf Tag" system.
 * Spec: workflows/design-system.md. Screens never use hex literals;
 * every color, radius, and duration comes from here.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B2620',
    textSecondary: '#5F6D64',
    background: '#FAF9F6',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#ECEFEA',
    accent: '#175E3E',
    accentMuted: '#E6F2E8',
    onAccent: '#FFFFFF',
    deal: '#B0540C',
    dealMuted: '#FBEEDD',
    border: '#E3E7E0',
    danger: '#B3261E',
    dangerMuted: '#F9E2E0',
  },
  dark: {
    text: '#E9F0E9',
    textSecondary: '#9CAAA0',
    background: '#0E1411',
    backgroundElement: '#181F1A',
    backgroundSelected: '#232C25',
    accent: '#5FC98E',
    accentMuted: '#173626',
    onAccent: '#0B2417',
    deal: '#F0A05C',
    dealMuted: '#3A2A18',
    border: '#2A332C',
    danger: '#F2B8B5',
    dangerMuted: '#42201E',
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
  card: 16,
  /** Buttons, inputs, steppers */
  control: 12,
  /** Product thumbnails */
  thumb: 10,
  /** Pills and chips */
  chip: 999,
} as const;

export const Motion = {
  /** Micro feedback: press scale, chip fades */
  fast: 140,
  /** Standard transitions: row expand, section reveals */
  base: 220,
  /** Shared spring for expand/settle moments */
  spring: { damping: 18, stiffness: 220 },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
