import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Motion, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePreferencesStore } from '@/state/preferences';

const entranceDelay = [0, 70, 140, 220] as const;

export function OnboardingFlow() {
  const persistedZip = usePreferencesStore((state) => state.zip);
  const confirmLocation = usePreferencesStore((state) => state.confirmLocation);
  const [zipInput, setZipInput] = useState(persistedZip);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const zipIsValid = /^\d{5}$/.test(zipInput);

  async function useCurrentLocation() {
    setLocationError(null);
    setResolvingLocation(true);

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        throw new Error('Turn on location services, then try again.');
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Location permission is needed to find nearby grocery stores.');
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000,
        requiredAccuracy: 5000,
      });
      const position =
        lastKnown ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      const addresses = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const postalCode = getPostalCode(addresses);

      if (!postalCode) {
        throw new Error('Could not resolve your ZIP code from this location.');
      }

      setZipInput(postalCode);
      confirmLocation(postalCode);
      Keyboard.dismiss();
    } catch (error) {
      setLocationError(getErrorMessage(error));
    } finally {
      setResolvingLocation(false);
    }
  }

  function submitZip() {
    if (!zipIsValid) {
      return;
    }

    setLocationError(null);
    confirmLocation(zipInput);
    Keyboard.dismiss();
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Animated.View entering={getEntrance(reducedMotion, 0)}>
              <ThemedText type="display" themeColor="accent">
                Cartwise
              </ThemedText>
            </Animated.View>
            <Animated.View entering={getEntrance(reducedMotion, 1)}>
              <ThemedText type="title">
                The same groceries cost different prices on the same street.
              </ThemedText>
            </Animated.View>
            <Animated.View entering={getEntrance(reducedMotion, 2)}>
              <ThemedText type="small" themeColor="textSecondary">
                Cartwise checks Kroger, Walmart, Target, and ALDI near you.
              </ThemedText>
            </Animated.View>
          </View>

          <Animated.View entering={getEntrance(reducedMotion, 3)}>
            <Card style={styles.locationCard}>
              <LocationButton
                busy={resolvingLocation}
                label="Use my location"
                onPress={useCurrentLocation}
              />

              <View style={styles.dividerRow}>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <ThemedText type="caption" themeColor="textSecondary">
                  or enter a ZIP
                </ThemedText>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
              </View>

              <TextInput
                accessibilityLabel="ZIP code"
                autoComplete="postal-code"
                inputMode="numeric"
                keyboardType="number-pad"
                maxLength={5}
                onSubmitEditing={submitZip}
                placeholder="45202"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="done"
                textContentType="postalCode"
                value={zipInput}
                onChangeText={(value) => setZipInput(value.replace(/\D/g, '').slice(0, 5))}
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: zipIsValid || zipInput.length === 0 ? theme.border : theme.danger,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
              />
              {zipInput.length > 0 && !zipIsValid ? (
                <ThemedText type="small" themeColor="danger">
                  Enter a 5-digit ZIP code.
                </ThemedText>
              ) : null}
              {locationError ? (
                <ThemedText type="small" themeColor="danger">
                  {locationError}
                </ThemedText>
              ) : null}
              <AppButton
                label="Continue"
                variant="secondary"
                size="lg"
                disabled={!zipIsValid}
                haptic="success"
                onPress={submitZip}
              />
            </Card>
          </Animated.View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function LocationButton({
  busy,
  label,
  onPress,
}: {
  busy: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.locationButtonWrap}>
      <AppButton
        accessibilityState={{ busy, disabled: busy }}
        haptic="light"
        label={label}
        loading={busy}
        onPress={onPress}
        size="lg"
        variant="primary"
      />
      {busy ? (
        <View
          pointerEvents="none"
          style={[styles.locationBusyOverlay, { backgroundColor: theme.accent }]}>
          <ThemedText type="bodyBold" themeColor="onAccent" numberOfLines={1}>
            {label}
          </ThemedText>
          <View style={styles.locationSpinner}>
            <ActivityIndicator color={theme.onAccent} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function getEntrance(reducedMotion: boolean, index: number) {
  const animation = reducedMotion ? FadeIn : FadeInDown;

  return animation.duration(Motion.base).delay(entranceDelay[index] ?? 0);
}

function getPostalCode(addresses: Location.LocationGeocodedAddress[]) {
  for (const address of addresses) {
    const match = address.postalCode?.match(/\d{5}/);
    if (match) {
      return match[0];
    }
  }

  return null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Cartwise could not resolve your location.';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.two,
  },
  locationCard: {
    gap: Spacing.three,
  },
  locationButtonWrap: {
    position: 'relative',
  },
  locationBusyOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radii.control + 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  locationSpinner: {
    position: 'absolute',
    right: Spacing.four,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: Radii.control,
    paddingHorizontal: Spacing.three,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  dividerRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  divider: {
    flex: 1,
    height: 1,
  },
});
