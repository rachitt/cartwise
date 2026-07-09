import { useEffect } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Motion, Radii, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SavingsTagProps = ViewProps & {
  label: string;
  size?: 'sm' | 'md';
  holeColor: ThemeColor;
  stamp?: boolean;
};

/** Used ONLY for money saved. One per card, max. */
export function SavingsTag({
  label,
  size = 'md',
  holeColor,
  stamp = false,
  style,
  ...rest
}: SavingsTagProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const shouldStamp = stamp && !reducedMotion;
  const scale = useSharedValue(shouldStamp ? 1.2 : 1);
  const rotation = useSharedValue(shouldStamp ? -7 : -2);

  useEffect(() => {
    if (shouldStamp) {
      scale.set(withSpring(1, Motion.springPop));
      rotation.set(withSpring(-2, Motion.springPop));
    } else {
      scale.set(1);
      rotation.set(-2);
    }
  }, [rotation, scale, shouldStamp]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }, { rotate: `${rotation.get()}deg` }],
  }));

  const isSmall = size === 'sm';

  return (
    <Animated.View
      {...rest}
      accessible
      accessibilityLabel={label}
      style={[
        styles.tag,
        isSmall ? styles.smallTag : styles.mediumTag,
        { backgroundColor: theme.dealTag },
        animatedStyle,
        style,
      ]}>
      <View
        style={[
          styles.hole,
          { left: isSmall ? 6 : 8, backgroundColor: theme[holeColor] },
        ]}
      />
      <ThemedText
        type={isSmall ? 'caption' : 'smallBold'}
        themeColor="onDealTag"
        numberOfLines={1}>
        {label}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    borderRadius: 8,
  },
  mediumTag: {
    paddingVertical: 5,
    paddingLeft: 22,
    paddingRight: 12,
  },
  smallTag: {
    paddingVertical: 3,
    paddingLeft: 18,
    paddingRight: 10,
  },
  hole: {
    position: 'absolute',
    top: '50%',
    marginTop: -3,
    width: 6,
    height: 6,
    borderRadius: Radii.chip,
  },
});
