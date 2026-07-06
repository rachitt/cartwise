import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Radii, Spacing } from '@/constants/theme';
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

  return (
    <Card style={[styles.card, style]} {...rest}>
      <View style={[styles.iconWell, { backgroundColor: theme.accentMuted }]}>
        <SymbolView name={icon} tintColor={theme.accent} size={26} />
      </View>
      <ThemedText type="heading" style={styles.centered}>
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
    width: 48,
    height: 48,
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
