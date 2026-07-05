import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { FreshnessStamp } from '@/components/ui/freshness-stamp';
import { PriceText } from '@/components/ui/price-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ReceiptRowProps = ViewProps & {
  /** Left side, e.g. store name. */
  title: string;
  /** Small line under the title, e.g. "Kroger · 1.2 mi". */
  meta?: string | null;
  /** Price shown right-aligned as a shelf tag. */
  value: number;
  /** Struck-through "was" price shown before the value (promos). */
  wasValue?: number | null;
  /** ISO timestamp for the freshness stamp under the price. */
  capturedAt?: string | null;
  /** Winning row: mint wash + "Best price" chip. */
  highlight?: boolean;
  /** Deal-orange delta chip, e.g. "+$1.20" or "Saves $1.20". */
  deltaLabel?: string | null;
};

/**
 * The receipt line: title, dotted leader, right-aligned shelf-tag price.
 * Used everywhere stores are compared (search expand, product detail,
 * cart-results store totals).
 */
export function ReceiptRow({
  title,
  meta,
  value,
  wasValue,
  capturedAt,
  highlight = false,
  deltaLabel,
  style,
  ...rest
}: ReceiptRowProps) {
  const theme = useTheme();

  return (
    <View
      style={[styles.row, highlight && { backgroundColor: theme.accentMuted }, style]}
      {...rest}>
      <View style={styles.topLine}>
        <View style={styles.titleBlock}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {title}
          </ThemedText>
        </View>
        <View style={[styles.leader, { borderBottomColor: theme.border }]} />
        <View style={styles.priceBlock}>
          {wasValue != null && wasValue > value ? (
            <PriceText value={wasValue} size="sm" strike />
          ) : null}
          <PriceText value={value} size="md" color={highlight ? 'accent' : 'text'} />
        </View>
      </View>
      <View style={styles.bottomLine}>
        <View style={styles.metaBlock}>
          {meta ? (
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {meta}
            </ThemedText>
          ) : null}
          {highlight ? <Chip label="Best price" tone="accent" /> : null}
          {deltaLabel ? <Chip label={deltaLabel} tone="deal" /> : null}
        </View>
        <FreshnessStamp capturedAt={capturedAt} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: Radii.thumb,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  titleBlock: {
    flexShrink: 1,
    minWidth: 0,
  },
  leader: {
    flex: 1,
    minWidth: Spacing.three,
    borderBottomWidth: 1,
    borderStyle: 'dotted',
    marginBottom: 4,
  },
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  metaBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
    minWidth: 0,
  },
});
