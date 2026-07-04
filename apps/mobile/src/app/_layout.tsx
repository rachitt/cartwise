import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { OnboardingFlow } from '@/components/onboarding-flow';
import { ThemedView } from '@/components/themed-view';
import { useNeedsOnboarding, usePreferencesStore } from '@/state/preferences';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const needsOnboarding = useNeedsOnboarding();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        {!hasHydrated ? (
          <ThemedView style={styles.loading}>
            <ActivityIndicator color="#16a34a" />
          </ThemedView>
        ) : needsOnboarding ? (
          <OnboardingFlow />
        ) : (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="products/[id]" />
            <Stack.Screen name="cart-results" />
          </Stack>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
