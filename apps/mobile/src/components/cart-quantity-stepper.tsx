import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Motion, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tapLight } from '@/lib/haptics';

const MINUS_ICON = {
  ios: 'minus',
  android: 'remove',
  web: 'remove',
} satisfies SymbolViewProps['name'];

const PLUS_ICON = {
  ios: 'plus',
  android: 'add',
  web: 'add',
} satisfies SymbolViewProps['name'];

type CartQuantityStepperProps = {
  qty: number;
  onChange: (qty: number) => void;
  compact?: boolean;
  disabled?: boolean;
};

export function CartQuantityStepper({
  qty,
  onChange,
  compact = false,
  disabled = false,
}: CartQuantityStepperProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const previousQty = useRef(qty);
  const qtyScale = useSharedValue(1);

  useEffect(() => {
    if (previousQty.current !== qty && !reducedMotion) {
      qtyScale.set(
        withSequence(
          withSpring(1.25, Motion.springPop),
          withSpring(1, Motion.springPop),
        ),
      );
    }
    previousQty.current = qty;
  }, [qty, qtyScale, reducedMotion]);

  const animatedQtyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: qtyScale.get() }],
  }));

  const handleChange = (nextQty: number, event?: GestureResponderEvent) => {
    event?.stopPropagation();
    if (!disabled) {
      tapLight();
      onChange(nextQty);
    }
  };

  return (
    <View
      style={[
        styles.container,
        compact && styles.compactContainer,
        { backgroundColor: theme.backgroundSelected },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        disabled={disabled}
        hitSlop={8}
        onPress={(event) => handleChange(Math.max(0, qty - 1), event)}
        style={({ pressed }) => [
          styles.button,
          compact && styles.compactButton,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}>
        <SymbolView name={MINUS_ICON} tintColor={theme.text} size={14} />
      </Pressable>
      <Animated.View style={animatedQtyStyle}>
        <ThemedText type="smallBold" style={[styles.qty, compact && styles.compactQty]}>
          {qty}
        </ThemedText>
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        disabled={disabled}
        hitSlop={8}
        onPress={(event) => handleChange(qty + 1, event)}
        style={({ pressed }) => [
          styles.button,
          compact && styles.compactButton,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}>
        <SymbolView name={PLUS_ICON} tintColor={theme.text} size={14} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 36,
    borderRadius: Radii.chip,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  compactContainer: {
    minHeight: 36,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: Radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButton: {
    width: 36,
    height: 36,
  },
  qty: {
    minWidth: 32,
    textAlign: 'center',
    paddingHorizontal: Spacing.one,
    fontVariant: ['tabular-nums'],
  },
  compactQty: {
    minWidth: 28,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.5,
  },
});
