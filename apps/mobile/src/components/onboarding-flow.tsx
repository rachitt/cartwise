import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCoverage, type CoverageResponse } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Motion, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { entrance } from '@/lib/motion';
import { usePreferencesStore } from '@/state/preferences';

type UnsupportedCoverage = CoverageResponse & { zip: string };

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export function OnboardingFlow() {
  const persistedZip = usePreferencesStore((state) => state.zip);
  const confirmLocation = usePreferencesStore((state) => state.confirmLocation);
  const [zipInput, setZipInput] = useState(persistedZip);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [unsupportedCoverage, setUnsupportedCoverage] = useState<UnsupportedCoverage | null>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const focusProgress = useSharedValue(0);
  const zipIsValid = /^\d{5}$/.test(zipInput);
  const inputBaseColor = zipIsValid || zipInput.length === 0 ? theme.border : theme.danger;
  const animatedInputStyle = useAnimatedStyle(
    () => ({
      borderColor: interpolateColor(
        focusProgress.get(),
        [0, 1],
        [inputBaseColor, theme.accent],
      ),
    }),
    [inputBaseColor, theme.accent],
  );

  function setInputFocus(nextValue: number) {
    focusProgress.set(
      reducedMotion ? nextValue : withTiming(nextValue, { duration: Motion.fast }),
    );
  }

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
      await continueWithZip(postalCode);
    } catch (error) {
      setLocationError(getErrorMessage(error));
    } finally {
      setResolvingLocation(false);
    }
  }

  async function submitZip() {
    if (!zipIsValid) {
      return;
    }

    await continueWithZip(zipInput);
  }

  async function continueWithZip(zip: string, skipCoverage = false) {
    if (!/^\d{5}$/.test(zip)) {
      return;
    }

    setLocationError(null);
    setCoverageError(null);
    setCheckingCoverage(true);

    try {
      if (!skipCoverage) {
        const coverage = await getCoverage(zip);

        if (!coverage.supported) {
          Keyboard.dismiss();
          setUnsupportedCoverage({ ...coverage, zip });
          return;
        }
      }

      confirmLocation(zip);
      Keyboard.dismiss();
    } catch {
      setCoverageError('Cartwise could not check coverage for this ZIP.');
    } finally {
      setCheckingCoverage(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Animated.View entering={entrance(0, reducedMotion)}>
              <ThemedText type="title" themeColor="accent">
                Cartwise
              </ThemedText>
            </Animated.View>
            <Animated.View entering={entrance(1, reducedMotion)}>
              <ThemedText type="displayXL">
                The same cart. Four different totals.
              </ThemedText>
            </Animated.View>
            <Animated.View entering={entrance(2, reducedMotion)}>
              <ThemedText type="small" themeColor="textSecondary">
                Cartwise checks Kroger, Walmart, Target, and ALDI near you — and finds where your
                whole cart is cheapest.
              </ThemedText>
            </Animated.View>
          </View>

          {unsupportedCoverage ? (
            <Animated.View entering={entrance(4, reducedMotion)}>
              <UnsupportedCoverageCard
                coverage={unsupportedCoverage}
                onBrowseAnyway={() => continueWithZip(unsupportedCoverage.zip, true)}
                onTryAnotherZip={() => {
                  setUnsupportedCoverage(null);
                  setCoverageError(null);
                }}
              />
            </Animated.View>
          ) : (
            <Animated.View entering={entrance(4, reducedMotion)}>
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

                <AnimatedTextInput
                  accessibilityLabel="ZIP code"
                  autoComplete="postal-code"
                  inputMode="numeric"
                  keyboardType="number-pad"
                  maxLength={5}
                  onBlur={() => setInputFocus(0)}
                  onFocus={() => setInputFocus(1)}
                  onSubmitEditing={submitZip}
                  placeholder="45202"
                  placeholderTextColor={theme.textSecondary}
                  returnKeyType="done"
                  textContentType="postalCode"
                  value={zipInput}
                  onChangeText={(value) => {
                    setZipInput(value.replace(/\D/g, '').slice(0, 5));
                    setCoverageError(null);
                  }}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      backgroundColor: theme.backgroundElement,
                    },
                    animatedInputStyle,
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
                {coverageError ? (
                  <ThemedText type="small" themeColor="danger">
                    {coverageError}
                  </ThemedText>
                ) : null}
                <AppButton
                  label="Continue"
                  variant="secondary"
                  size="lg"
                  disabled={!zipIsValid || checkingCoverage}
                  loading={checkingCoverage}
                  haptic="success"
                  onPress={submitZip}
                />
              </Card>
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function UnsupportedCoverageCard({
  coverage,
  onBrowseAnyway,
  onTryAnotherZip,
}: {
  coverage: UnsupportedCoverage;
  onBrowseAnyway: () => void;
  onTryAnotherZip: () => void;
}) {
  const chainCount = coverage.chains.length;
  const chainLabelText = `${chainCount} ${chainCount === 1 ? 'chain' : 'chains'}`;
  const storeLabel = `${coverage.storeCount} ${coverage.storeCount === 1 ? 'store' : 'stores'}`;

  return (
    <Card style={styles.locationCard}>
      <View style={styles.unsupportedCopy}>
        <ThemedText type="title">{"Cartwise doesn't fully cover your area yet"}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          ZIP {coverage.zip} has {storeLabel} across {chainLabelText}. Comparisons may be incomplete.
        </ThemedText>
      </View>
      <AppButton label="Try another ZIP" size="lg" onPress={onTryAnotherZip} />
      <AppButton
        label="Browse anyway"
        variant="secondary"
        size="lg"
        haptic="success"
        onPress={onBrowseAnyway}
      />
    </Card>
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
  unsupportedCopy: {
    gap: Spacing.two,
  },
  locationButtonWrap: {
    position: 'relative',
  },
  locationBusyOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radii.chip,
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
    minHeight: 56,
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
