import { StyleSheet, Text, View, type ViewProps } from 'react-native';

import { FontFamilies, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PriceTextSize = 'sm' | 'md' | 'lg' | 'hero';

export type PriceTextProps = ViewProps & {
  /** Dollar amount, e.g. 3.49. Negative values render with a leading minus. */
  value: number;
  size?: PriceTextSize;
  color?: ThemeColor;
  /** Render as a struck-through "was" price. */
  strike?: boolean;
};

/**
 * The shelf tag: tabular dollars with raised superscript cents ($3⁴⁹).
 * Every price in the app renders through this component.
 */
export function PriceText({
  value,
  size = 'md',
  color,
  strike = false,
  style,
  ...rest
}: PriceTextProps) {
  const theme = useTheme();
  const totalCents = Math.round(Math.abs(value) * 100);
  const dollars = `${value < 0 ? '-' : ''}${Math.floor(totalCents / 100)}`;
  const cents = `${totalCents % 100}`.padStart(2, '0');
  const spec = sizes[size];
  const textColor = theme[color ?? (strike ? 'textSecondary' : 'text')];

  return (
    <View
      accessible
      accessibilityLabel={`${value < 0 ? 'minus ' : ''}$${Math.floor(totalCents / 100)}.${cents}`}
      style={[styles.row, style]}
      {...rest}>
      <Text
        allowFontScaling={false}
        style={[
          styles.super,
          { color: textColor, fontSize: spec.superSize, lineHeight: spec.superSize + 2 },
          spec.display && styles.displayFace,
          strike && styles.strike,
        ]}>
        $
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          styles.dollars,
          { color: textColor, fontSize: spec.mainSize, lineHeight: spec.mainSize + 2 },
          spec.display && styles.displayFace,
          strike && styles.strike,
        ]}>
        {dollars}
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          styles.super,
          { color: textColor, fontSize: spec.superSize, lineHeight: spec.superSize + 2 },
          spec.display && styles.displayFace,
          strike && styles.strike,
        ]}>
        {cents}
      </Text>
    </View>
  );
}

const sizes: Record<PriceTextSize, { mainSize: number; superSize: number; display?: boolean }> = {
  sm: { mainSize: 15, superSize: 11 },
  md: { mainSize: 18, superSize: 12 },
  lg: { mainSize: 24, superSize: 14 },
  hero: { mainSize: 48, superSize: 24, display: true },
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dollars: {
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  super: {
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  displayFace: {
    fontFamily: FontFamilies.displayExtraBold,
    fontWeight: undefined,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
});
