import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  useReducedMotion,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/button';
import { BottomTabInset, Elevation, Radii, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type StickyActionBarProps = {
  summary: string;
  detail?: string;
  actionLabel: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/** Floating cart CTA docked above the floating tab bar. */
export function StickyActionBar({
  summary,
  detail,
  actionLabel,
  onPress,
  loading = false,
  disabled = false,
}: StickyActionBarProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const reducedMotion = useReducedMotion();

  return (
    <Animated.View
      entering={(reducedMotion ? FadeIn : FadeInDown).duration(240)}
      exiting={(reducedMotion ? FadeOut : FadeOutDown).duration(240)}
      style={[
        styles.bar,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderWidth: scheme === 'dark' ? StyleSheet.hairlineWidth : 0,
          shadowColor: theme.shadow,
        },
      ]}>
      <View style={styles.copy}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {summary}
        </ThemedText>
        {detail ? (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      <AppButton
        label={actionLabel}
        variant="primary"
        size="md"
        loading={loading}
        disabled={disabled}
        onPress={onPress}
        style={styles.action}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: BottomTabInset + 12,
    borderRadius: Radii.hero,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    zIndex: 19,
    ...Elevation.float,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  action: {
    flexShrink: 0,
  },
});
