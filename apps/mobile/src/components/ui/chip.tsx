import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChipTone = 'accent' | 'deal' | 'neutral' | 'danger' | 'hero';

export type ChipProps = ViewProps & {
  label: string;
  tone?: ChipTone;
};

type ChipToneColors = {
  background: ThemeColor | 'rgba(255,255,255,0.16)';
  foreground: ThemeColor;
};

const tones: Record<ChipTone, ChipToneColors> = {
  accent: { background: 'accentMuted', foreground: 'accent' },
  deal: { background: 'dealMuted', foreground: 'deal' },
  neutral: { background: 'backgroundSelected', foreground: 'textSecondary' },
  danger: { background: 'dangerMuted', foreground: 'danger' },
  // Design-system.md permits this sole literal for translucent chips on hero surfaces.
  hero: { background: 'rgba(255,255,255,0.16)', foreground: 'onHero' },
};

/**
 * Pill label. `deal` tone is reserved for savings ("Saves $1.20") and price
 * drops; `accent` marks state ("Best price", "ZIP 45202").
 */
export function Chip({ label, tone = 'neutral', style, ...rest }: ChipProps) {
  const theme = useTheme();
  const { background, foreground } = tones[tone];

  const backgroundColor =
    background === 'rgba(255,255,255,0.16)' ? background : theme[background];

  return (
    <View style={[styles.chip, { backgroundColor }, style]} {...rest}>
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
    minHeight: 24,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one + Spacing.half,
  },
  label: {
    fontWeight: 700,
  },
});
