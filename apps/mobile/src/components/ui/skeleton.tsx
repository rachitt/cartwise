import { useEffect } from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SkeletonProps = {
  height: number;
  width?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Loading placeholder shaped like the content it replaces.
 * Pulses opacity; renders static under reduced motion.
 */
export function Skeleton({ height, width = '100%', radius = Radii.thumb, style }: SkeletonProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!reducedMotion) {
      pulse.value = withRepeat(
        withTiming(0.45, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    }
  }, [pulse, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0.6 : pulse.value,
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[
        { height, width, borderRadius: radius, backgroundColor: theme.backgroundSelected },
        animatedStyle,
        style,
      ]}
    />
  );
}
