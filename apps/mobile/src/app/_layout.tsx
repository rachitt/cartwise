import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, Platform, StyleSheet, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { OnboardingFlow } from '@/components/onboarding-flow';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useNeedsOnboarding, usePreferencesStore } from '@/state/preferences';

SplashScreen.preventAutoHideAsync();

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const queryClient = new QueryClient();

const navigationThemes = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: Colors.light.accent,
      background: Colors.light.background,
      card: Colors.light.backgroundElement,
      text: Colors.light.text,
      border: Colors.light.border,
      notification: Colors.light.deal,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: Colors.dark.accent,
      background: Colors.dark.background,
      card: Colors.dark.backgroundElement,
      text: Colors.dark.text,
      border: Colors.dark.border,
      notification: Colors.dark.deal,
    },
  },
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const needsOnboarding = useNeedsOnboarding();
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';

  if (!fontsLoaded && !fontError) {
    // Native splash stays up (preventAutoHideAsync above) until fonts are in.
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navigationThemes[scheme]}>
        <AnimatedSplashOverlay />
        {!hasHydrated ? (
          <ThemedView style={styles.loading}>
            <ActivityIndicator color={Colors[scheme].accent} />
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
