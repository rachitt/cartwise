import type { Store } from '@cartwise/shared';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStores } from '@/api/queries';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { chainLabel } from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';
import { useTheme } from '@/hooks/use-theme';

type Step = 'zip' | 'stores';

export function OnboardingFlow() {
  const persistedZip = usePreferencesStore((state) => state.zip);
  const selectedStoreIds = usePreferencesStore((state) => state.selectedStoreIds);
  const setZip = usePreferencesStore((state) => state.setZip);
  const setSelectedStoreIds = usePreferencesStore((state) => state.setSelectedStoreIds);
  const [step, setStep] = useState<Step>(persistedZip.length === 5 ? 'stores' : 'zip');
  const [zipInput, setZipInput] = useState(persistedZip);
  const [draftStoreIds, setDraftStoreIds] = useState<string[]>(selectedStoreIds);
  const theme = useTheme();
  const zipIsValid = /^\d{5}$/.test(zipInput);
  const storesQuery = useStores(persistedZip);

  const sortedStores = useMemo(
    () =>
      [...(storesQuery.data?.stores ?? [])].sort(
        (first, second) => (first.distanceMiles ?? 0) - (second.distanceMiles ?? 0),
      ),
    [storesQuery.data?.stores],
  );

  function submitZip() {
    if (!zipIsValid) {
      return;
    }

    setZip(zipInput);
    setSelectedStoreIds([]);
    setDraftStoreIds([]);
    setStep('stores');
  }

  function toggleStore(storeId: string) {
    setDraftStoreIds((current) =>
      current.includes(storeId) ? current.filter((id) => id !== storeId) : [...current, storeId],
    );
  }

  function finishOnboarding() {
    if (draftStoreIds.length >= 2) {
      setSelectedStoreIds(draftStoreIds);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <ThemedText type="smallBold" themeColor="accent">
              Cartwise
            </ThemedText>
            <ThemedText type="subtitle">
              {step === 'zip' ? 'Compare grocery prices nearby' : 'Choose nearby stores'}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {step === 'zip'
                ? 'Enter a ZIP code to find stores before comparing one item at a time.'
                : 'Pick at least two stores so Cartwise can rank prices for each item.'}
            </ThemedText>
          </View>

          {step === 'zip' ? (
            <View style={styles.panel}>
              <TextInput
                accessibilityLabel="ZIP code"
                inputMode="numeric"
                maxLength={5}
                placeholder="45202"
                placeholderTextColor={theme.textSecondary}
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
              <PrimaryButton label="Find stores" disabled={!zipIsValid} onPress={submitZip} />
            </View>
          ) : (
            <View style={styles.storeStep}>
              <View style={styles.stepBar}>
                <ThemedText type="small" themeColor="textSecondary">
                  ZIP {persistedZip}
                </ThemedText>
                <Pressable onPress={() => setStep('zip')} hitSlop={12}>
                  <ThemedText type="linkPrimary">Change ZIP</ThemedText>
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.storeList}>
                {storesQuery.isLoading ? (
                  <StoreSkeleton />
                ) : sortedStores.length === 0 ? (
                  <EmptyPanel message="No stores found nearby." />
                ) : (
                  sortedStores.map((store) => (
                    <StoreOption
                      key={store.id}
                      store={store}
                      selected={draftStoreIds.includes(store.id)}
                      onPress={() => toggleStore(store.id)}
                    />
                  ))
                )}
              </ScrollView>

              <PrimaryButton
                label="Continue"
                disabled={draftStoreIds.length < 2}
                onPress={finishOnboarding}
              />
              <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                {draftStoreIds.length < 2
                  ? 'Select at least two stores to continue.'
                  : `${draftStoreIds.length} stores selected`}
              </ThemedText>
            </View>
          )}
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

function StoreOption({
  store,
  selected,
  onPress,
}: {
  store: Store;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={selected ? 'accentMuted' : 'backgroundElement'}
        style={[styles.storeOption, { borderColor: selected ? theme.accent : theme.border }]}>
        <View style={styles.storeCopy}>
          <ThemedText type="smallBold">{store.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {chainLabel(store.chain)} · {store.address}
          </ThemedText>
        </View>
        <View style={styles.distancePill}>
          <ThemedText type="smallBold" themeColor={selected ? 'accent' : 'textSecondary'}>
            {store.distanceMiles?.toFixed(1) ?? '--'} mi
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

function StoreSkeleton() {
  return (
    <View style={styles.skeletonStack}>
      <ActivityIndicator color="#16a34a" />
      {[0, 1, 2].map((item) => (
        <ThemedView key={item} type="backgroundElement" style={styles.skeletonRow} />
      ))}
    </View>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.emptyPanel}>
      <ThemedText themeColor="textSecondary">{message}</ThemedText>
    </ThemedView>
  );
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
  storeStep: {
    flex: 1,
    gap: Spacing.three,
  },
  stepBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storeList: {
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  storeOption: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  storeCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  distancePill: {
    minWidth: 58,
    alignItems: 'flex-end',
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
  pressed: {
    opacity: 0.72,
  },
  centered: {
    textAlign: 'center',
  },
  skeletonStack: {
    gap: Spacing.three,
  },
  skeletonRow: {
    height: 82,
    borderRadius: 8,
  },
  emptyPanel: {
    minHeight: 96,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
});
