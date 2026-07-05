import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
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
  disabled?: boolean;
};

export function CartQuantityStepper({
  qty,
  onChange,
  disabled = false,
}: CartQuantityStepperProps) {
  const theme = useTheme();

  const handleChange = (nextQty: number, event: GestureResponderEvent) => {
    event.stopPropagation();

    if (disabled) {
      return;
    }

    tapLight();
    onChange(nextQty);
  };

  return (
    <View
      accessibilityLabel={`Quantity ${qty}`}
      accessibilityValue={{ now: qty }}
      style={[
        styles.container,
        { backgroundColor: theme.background, borderColor: theme.border },
        disabled && styles.disabled,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        disabled={disabled}
        hitSlop={8}
        onPress={(event) => handleChange(Math.max(0, qty - 1), event)}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <SymbolView name={MINUS_ICON} tintColor={theme.text} size={14} />
      </Pressable>
      <ThemedText type="smallBold" style={styles.qty}>
        {qty}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        disabled={disabled}
        hitSlop={8}
        onPress={(event) => handleChange(qty + 1, event)}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <SymbolView name={PLUS_ICON} tintColor={theme.text} size={14} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    borderRadius: Radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  button: {
    width: 44,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    minWidth: 34,
    textAlign: 'center',
    paddingHorizontal: Spacing.one,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.5,
  },
});
