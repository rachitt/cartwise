/**
 * Cartwise design tokens — "The Shelf Tag" system.
 * Spec: workflows/design-system.md. Screens never use hex literals;
 * every color, radius, and duration comes from here.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#17231D',
    textSecondary: '#647369',
    background: '#FFFDF8',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F1F5EF',
    accent: '#0F6B45',
    accentMuted: '#EAF7EE',
    onAccent: '#FFFFFF',
    deal: '#B95714',
    dealMuted: '#FFF0DE',
    border: '#DDE7DC',
    danger: '#B3261E',
    dangerMuted: '#F9E2E0',
  },
  dark: {
    text: '#EFF7EF',
    textSecondary: '#A9B8AD',
    background: '#101611',
    backgroundElement: '#1B241D',
    backgroundSelected: '#253127',
    accent: '#78DFA5',
    accentMuted: '#173D29',
    onAccent: '#0B2417',
    deal: '#F2A35C',
    dealMuted: '#3F2A17',
    border: '#344237',
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
