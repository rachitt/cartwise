import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PriceText, type PriceTextProps } from '@/components/ui/price-text';
import { Motion } from '@/constants/theme';

export type AnimatedPriceTextProps = PriceTextProps;

/** PriceText that counts to its value for hero money moments. */
export function AnimatedPriceText({ value, ...rest }: AnimatedPriceTextProps) {
  const reducedMotion = useReducedMotion();
  const staticRendering = reducedMotion || Platform.OS === 'web';
  const animatedValue = useSharedValue(staticRendering ? value : 0);
  const [displayValue, setDisplayValue] = useState(staticRendering ? value : 0);

  useAnimatedReaction(
    () => animatedValue.get(),
    (currentValue, previousValue) => {
      const roundedValue = Math.round(currentValue * 100) / 100;
      const roundedPrevious =
        previousValue === null ? null : Math.round(previousValue * 100) / 100;

      if (!staticRendering && roundedValue !== roundedPrevious) {
        runOnJS(setDisplayValue)(roundedValue);
      }
    },
    [staticRendering]
  );

  useEffect(() => {
    if (staticRendering) {
      animatedValue.set(value);
      return;
    }

    animatedValue.set(
      withTiming(
        value,
        { duration: Motion.slow, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(setDisplayValue)(value);
          }
        }
      )
    );
  }, [animatedValue, staticRendering, value]);

  return <PriceText value={staticRendering ? value : displayValue} {...rest} />;
}
