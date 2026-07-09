import { FadeIn, FadeInDown } from 'react-native-reanimated';

/** Section/row entrance. Cap the stagger at 8 steps; fires once per mount. */
export function entrance(index: number, reducedMotion: boolean) {
  return (reducedMotion ? FadeIn : FadeInDown)
    .duration(320)
    .delay(60 * Math.min(index, 7));
}
