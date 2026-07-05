import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** Light tick for small actions: add to cart, stepper taps. */
export function tapLight() {
  if (enabled) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

/** Success notification for milestone actions: finalize cart, enable alerts. */
export function tapSuccess() {
  if (enabled) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
}

/** Selection tick for toggles and pickers. */
export function tapSelection() {
  if (enabled) {
    Haptics.selectionAsync().catch(() => {});
  }
}
