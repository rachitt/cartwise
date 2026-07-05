import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatFreshnessStamp, freshnessTone, type FreshnessTone } from '@/lib/price';

export type FreshnessStampProps = ViewProps & {
  capturedAt?: string | null;
};

const toneColors: Record<FreshnessTone, ThemeColor> = {
  fresh: 'accent',
  aging: 'textSecondary',
  stale: 'danger',
};

/**
 * The trust contract: a register-style mono timestamp with a status dot.
 * Accent dot = captured within 6h, neutral = within 48h, danger = older/unknown.
 * Every price row shows one; it is never hidden or dropped.
 */
export function FreshnessStamp({ capturedAt, style, ...rest }: FreshnessStampProps) {
  const theme = useTheme();
  const dotColor = toneColors[freshnessTone(capturedAt)];

  return (
    <View style={[styles.row, style]} {...rest}>
      <View style={[styles.dot, { backgroundColor: theme[dotColor] }]} />
      <ThemedText type="stamp" numberOfLines={1}>
        {formatFreshnessStamp(capturedAt)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radii.chip,
  },
});
