import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChipTone = 'accent' | 'deal' | 'neutral' | 'danger';

export type ChipProps = ViewProps & {
  label: string;
  tone?: ChipTone;
};

const tones: Record<ChipTone, { background: ThemeColor; foreground: ThemeColor }> = {
  accent: { background: 'accentMuted', foreground: 'accent' },
  deal: { background: 'dealMuted', foreground: 'deal' },
  neutral: { background: 'backgroundSelected', foreground: 'textSecondary' },
  danger: { background: 'dangerMuted', foreground: 'danger' },
};

/**
 * Pill label. `deal` tone is reserved for savings ("Saves $1.20") and price
 * drops; `accent` marks state ("Best price", "ZIP 45202").
 */
export function Chip({ label, tone = 'neutral', style, ...rest }: ChipProps) {
  const theme = useTheme();
  const { background, foreground } = tones[tone];

  return (
    <View style={[styles.chip, { backgroundColor: theme[background] }, style]} {...rest}>
      <ThemedText type="caption" themeColor={foreground} style={styles.label} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: Radii.chip,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one,
  },
  label: {
    fontWeight: 700,
  },
});
