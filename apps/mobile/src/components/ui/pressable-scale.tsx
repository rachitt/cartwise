import {
  Pressable,
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

import { Motion } from '@/constants/theme';
import { tapLight, tapSelection } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  haptic?: 'light' | 'selection' | 'none';
};

/** Pressable behavior shared by navigating cards and rows. */
export function PressableScale({
  haptic = 'light',
  onPress,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: PressableScaleProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <AnimatedPressable
      onPressIn={(event) => {
        if (!reducedMotion) {
          scale.set(withSpring(0.97, Motion.springGentle));
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!reducedMotion) {
          scale.set(withSpring(1, Motion.springGentle));
        }
        onPressOut?.(event);
      }}
      onPress={(event) => {
        if (haptic === 'light') {
          tapLight();
        } else if (haptic === 'selection') {
          tapSelection();
        }
        onPress?.(event);
      }}
      style={[animatedStyle, style]}
      {...rest}
    />
  );
}
