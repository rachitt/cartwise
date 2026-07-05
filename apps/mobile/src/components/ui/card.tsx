import { View, type ViewProps } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CardProps = ViewProps & {
  /** Remove the default inner padding (for cards composed of full-bleed rows). */
  flush?: boolean;
};

/** Surface container: card radius, hairline border, no shadow. */
export function Card({ flush = false, style, ...rest }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: Radii.card,
          overflow: 'hidden',
        },
        !flush && { padding: Spacing.three },
        style,
      ]}
      {...rest}
    />
  );
}
