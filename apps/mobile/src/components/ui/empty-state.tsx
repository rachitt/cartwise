import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Motion, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type EmptyStateProps = ViewProps & {
  icon: SymbolViewProps['name'];
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
};

/** Empty and error states: icon, direct title, one-line way forward, optional action. */
export function EmptyState({ icon, title, message, action, style, ...rest }: EmptyStateProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(reducedMotion ? 1 : 0.8);
  const opacity = useSharedValue(reducedMotion ? 0 : 1);

  useEffect(() => {
    if (reducedMotion) {
      opacity.set(withTiming(1, { duration: Motion.fast }));
    } else {
      scale.set(withSpring(1, Motion.springPop));
    }
  }, [opacity, reducedMotion, scale]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));

  return (
    <Card style={[styles.card, style]} {...rest}>
      <Animated.View
        style={[
          styles.iconWell,
          { backgroundColor: theme.accentMuted },
          animatedIconStyle,
        ]}>
        <SymbolView name={icon} tintColor={theme.accent} size={28} />
      </Animated.View>
      <ThemedText type="title" style={styles.centered}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        {message}
      </ThemedText>
      {action ? (
        <AppButton
          label={action.label}
          variant="secondary"
          onPress={action.onPress}
          style={styles.action}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: Radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  centered: {
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.two,
  },
});
