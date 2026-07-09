import * as Font from 'expo-font';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, Keyframe, useReducedMotion } from 'react-native-reanimated';

import { Colors, FontFamilies, Motion, Radii, Spacing } from '@/constants/theme';

const iconKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 0.94 }],
    opacity: 0,
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.out(Easing.cubic),
  },
});

export function AnimatedSplashOverlay() {
  return null;
}

export function AnimatedIcon() {
  const reducedMotion = useReducedMotion();
  const displayFontFamily = Font.isLoaded(FontFamilies.displayBold)
    ? FontFamilies.displayBold
    : undefined;

  return (
    <View style={styles.iconContainer}>
      <Animated.View
        entering={
          reducedMotion ? FadeIn.duration(Motion.fast) : iconKeyframe.duration(Motion.base)
        }
        style={styles.iconBackground}>
        <Animated.Text
          style={[styles.mark, displayFontFamily ? { fontFamily: displayFontFamily } : null]}>
          Cartwise
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 192,
    height: 96,
  },
  iconBackground: {
    width: 192,
    height: 96,
    borderRadius: Radii.card,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    color: Colors.light.accent,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    paddingHorizontal: Spacing.two,
    textAlign: 'center',
  },
});
