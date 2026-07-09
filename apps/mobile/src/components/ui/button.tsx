import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Motion, Radii, Spacing, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tapLight, tapSuccess } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type AppButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: AppButtonVariant;
  size?: 'md' | 'lg';
  loading?: boolean;
  /** Haptic fired on press. Defaults to a light tick; use `success` for milestones. */
  haptic?: 'light' | 'success' | 'none';
  style?: StyleProp<ViewStyle>;
};

const variantColors: Record<
  AppButtonVariant,
  { background: ThemeColor | null; foreground: ThemeColor; bordered?: boolean }
> = {
  primary: { background: 'accent', foreground: 'onAccent' },
  secondary: { background: 'backgroundElement', foreground: 'text', bordered: true },
  ghost: { background: null, foreground: 'accent' },
  danger: { background: 'dangerMuted', foreground: 'danger' },
};

export function AppButton({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  haptic = 'light',
  disabled,
  onPress,
  style,
  ...rest
}: AppButtonProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const colors = variantColors[variant];
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPressIn={() => {
        if (!reducedMotion) {
          scale.set(withSpring(0.97, Motion.springGentle));
        }
      }}
      onPressOut={() => {
        if (!reducedMotion) {
          scale.set(withSpring(1, Motion.springGentle));
        }
      }}
      onPress={(event) => {
        if (haptic === 'light') {
          tapLight();
        } else if (haptic === 'success') {
          tapSuccess();
        }
        onPress?.(event);
      }}
      style={[
        styles.base,
        size === 'lg' && styles.large,
        colors.background !== null && { backgroundColor: theme[colors.background] },
        colors.bordered === true && { borderWidth: 1, borderColor: theme.border },
        isDisabled && styles.disabled,
        animatedStyle,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={theme[colors.foreground]} />
      ) : (
        <ThemedText
          type={size === 'lg' ? 'bodyBold' : 'smallBold'}
          themeColor={colors.foreground}
          numberOfLines={1}>
          {label}
        </ThemedText>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: Radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  large: {
    minHeight: 56,
    borderRadius: Radii.chip,
    paddingHorizontal: Spacing.five,
  },
  disabled: {
    opacity: 0.45,
  },
});
