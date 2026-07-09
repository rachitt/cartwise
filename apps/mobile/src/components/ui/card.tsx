import { LinearGradient } from 'expo-linear-gradient';
import { View, type ViewProps } from 'react-native';

import { Elevation, Radii, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type CardProps = ViewProps & {
  /** Remove the default inner padding (for cards composed of full-bleed rows). */
  flush?: boolean;
  /** Enable depth in light mode. Dark cards retain a hairline instead. */
  elevated?: boolean;
  /** Render the standard card surface or the full-color hero gradient. */
  surface?: 'default' | 'hero';
};

/** Surface container with scheme-aware depth and an optional hero gradient. */
export function Card({
  flush = false,
  elevated = true,
  surface = 'default',
  style,
  ...rest
}: CardProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  if (surface === 'hero') {
    return (
      <LinearGradient
        colors={[theme.heroSurface, theme.heroSurfaceDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          {
            borderRadius: Radii.hero,
            padding: Spacing.four,
            shadowColor: theme.shadow,
            ...Elevation.float,
          },
          style,
        ]}
        {...rest}
      />
    );
  }

  const usesElevation = !isDark && elevated;

  return (
    <View
      style={[
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderWidth: usesElevation ? 0 : 1,
          borderRadius: Radii.card,
        },
        usesElevation && { ...Elevation.card, shadowColor: theme.shadow },
        flush && { overflow: 'hidden' },
        !flush && { padding: Spacing.three },
        style,
      ]}
      {...rest}
    />
  );
}
