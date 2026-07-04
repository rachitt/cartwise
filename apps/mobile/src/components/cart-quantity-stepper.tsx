import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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

  const handleChange = (nextQty: number, event?: GestureResponderEvent) => {
    event?.stopPropagation();
    if (!disabled) {
      onChange(nextQty);
    }
  };

  return (
    <View
      style={[
        styles.container,
        compact && styles.compactContainer,
        { borderColor: theme.border, backgroundColor: theme.background },
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
        <ThemedText type="smallBold">-</ThemedText>
      </Pressable>
      <ThemedText type="smallBold" style={[styles.qty, compact && styles.compactQty]}>
        {qty}
      </ThemedText>
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
        <ThemedText type="smallBold">+</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  compactContainer: {
    minHeight: 36,
  },
  button: {
    width: 44,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButton: {
    width: 36,
    minHeight: 34,
  },
  qty: {
    minWidth: 32,
    textAlign: 'center',
    paddingHorizontal: Spacing.one,
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
