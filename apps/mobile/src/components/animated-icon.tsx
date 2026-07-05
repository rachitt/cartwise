import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe, useReducedMotion } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Colors, FontFamilies, Motion, Radii, Spacing } from '@/constants/theme';

const DURATION = Motion.base;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);
  const reducedMotion = useReducedMotion();

  if (!visible) return null;

  return animate ? (
    <Animated.View
      entering={getSplashExitKeyframe(reducedMotion).duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}>
      <CartwiseMark />
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}>
      <CartwiseMark />
    </View>
  );
}

const iconBackgroundKeyframe = new Keyframe({
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

const markKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 0.98 }],
    opacity: 0,
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.out(Easing.cubic),
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View
        entering={iconBackgroundKeyframe.duration(DURATION)}
        style={styles.iconBackground}
      />
      <Animated.View entering={markKeyframe.duration(DURATION)} style={styles.imageContainer}>
        <CartwiseMark compact />
      </Animated.View>
    </View>
  );
}

function CartwiseMark({ compact = false }: { compact?: boolean }) {
  const displayFontFamily = Font.isLoaded(FontFamilies.displayBold)
    ? FontFamilies.displayBold
    : undefined;

  return (
    <Animated.Text
      style={[
        styles.mark,
        compact && styles.compactMark,
        displayFontFamily ? { fontFamily: displayFontFamily } : null,
      ]}>
      Cartwise
    </Animated.Text>
  );
}

function getSplashExitKeyframe(reducedMotion: boolean) {
  return new Keyframe({
    0: {
      opacity: 1,
      transform: [{ scale: 1 }],
    },
    100: {
      opacity: 0,
      transform: [{ scale: reducedMotion ? 1 : 0.96 }],
      easing: Easing.out(Easing.cubic),
    },
  });
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 192,
    height: 96,
    zIndex: 100,
  },
  iconBackground: {
    backgroundColor: Colors.light.accent,
    borderRadius: Radii.card,
    width: 192,
    height: 96,
    position: 'absolute',
  },
  mark: {
    color: Colors.light.onAccent,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '700',
    paddingHorizontal: Spacing.two,
    textAlign: 'center',
  },
  compactMark: {
    fontSize: 34,
    lineHeight: 40,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.light.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
