import * as Location from 'expo-location';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePreferencesStore } from '@/state/preferences';

export function OnboardingFlow() {
  const persistedZip = usePreferencesStore((state) => state.zip);
  const confirmLocation = usePreferencesStore((state) => state.confirmLocation);
  const [zipInput, setZipInput] = useState(persistedZip);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const theme = useTheme();
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
            <ThemedText type="smallBold" themeColor="accent">
              Cartwise
            </ThemedText>
            <ThemedText type="subtitle">Find nearby groceries</ThemedText>
            <ThemedText themeColor="textSecondary">
              Set your location first. Cartwise will automatically search all nearby grocery stores
              for every item.
            </ThemedText>
          </View>

          <View style={styles.panel}>
            <PrimaryButton
              label={resolvingLocation ? 'Finding location...' : 'Use current location'}
              disabled={resolvingLocation}
              onPress={useCurrentLocation}
            />

            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <ThemedText type="small" themeColor="textSecondary">
                or enter ZIP
              </ThemedText>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>

            <TextInput
              accessibilityLabel="ZIP code"
              inputMode="numeric"
              maxLength={5}
              onSubmitEditing={submitZip}
              placeholder="45202"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
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
            <SecondaryButton label="Continue to search" disabled={!zipIsValid} onPress={submitZip} />
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function PrimaryButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: disabled ? theme.backgroundSelected : theme.accent },
        pressed && !disabled && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={styles.primaryButtonText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        { borderColor: theme.border, backgroundColor: theme.backgroundElement },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <ThemedText type="smallBold" themeColor={disabled ? 'textSecondary' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
  );
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
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.two,
  },
  panel: {
    gap: Spacing.three,
  },
  input: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    fontSize: 24,
    fontWeight: '700',
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
  primaryButton: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  secondaryButton: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.55,
  },
});
