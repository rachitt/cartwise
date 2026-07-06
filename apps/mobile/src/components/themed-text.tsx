import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { FontFamilies, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType =
  | 'display'
  | 'title'
  | 'heading'
  | 'default'
  | 'bodyBold'
  | 'small'
  | 'smallBold'
  | 'caption'
  | 'eyebrow'
  | 'stamp'
  // Legacy variants kept while screens migrate — do not use in new code.
  | 'subtitle'
  | 'link'
  | 'linkPrimary'
  | 'code';

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const defaultColor = type === 'eyebrow' || type === 'stamp' ? 'textSecondary' : 'text';

  return (
    <Text
      style={[{ color: theme[themeColor ?? defaultColor] }, styles[type], style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  display: {
    fontFamily: FontFamilies.displayBold,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: 0,
  },
  title: {
    fontFamily: FontFamilies.displaySemiBold,
    fontSize: 22,
    lineHeight: 28,
  },
  heading: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 600,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 400,
  },
  bodyBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 700,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  stamp: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 500,
  },
  subtitle: {
    fontFamily: FontFamilies.displaySemiBold,
    fontSize: 26,
    lineHeight: 32,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
