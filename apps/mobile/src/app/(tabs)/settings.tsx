import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStores } from '@/api/queries';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { chainLabel } from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const zip = usePreferencesStore((state) => state.zip);
  const selectedStoreIds = usePreferencesStore((state) => state.selectedStoreIds);
  const resetStores = usePreferencesStore((state) => state.resetStores);
  const storesQuery = useStores(zip);
  const theme = useTheme();

  const selectedStores = useMemo(() => {
    const selected = new Set(selectedStoreIds);
    return (storesQuery.data?.stores ?? []).filter((store) => selected.has(store.id));
  }, [selectedStoreIds, storesQuery.data?.stores]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Settings</ThemedText>
            <ThemedText themeColor="textSecondary">Manage the stores used for comparisons.</ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedText type="small" themeColor="textSecondary">
              ZIP
            </ThemedText>
            <ThemedText type="smallBold">{zip}</ThemedText>
          </ThemedView>

          <View style={styles.section}>
            <ThemedText type="smallBold">Selected stores</ThemedText>
            {selectedStores.map((store) => (
              <ThemedView key={store.id} type="backgroundElement" style={styles.storeRow}>
                <View style={styles.storeCopy}>
                  <ThemedText type="smallBold">{store.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {chainLabel(store.chain)} · {store.distanceMiles?.toFixed(1) ?? '--'} mi
                  </ThemedText>
                </View>
              </ThemedView>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={resetStores}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.accent },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={styles.buttonText}>
              Change stores
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
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
  scrollView: {
    width: '100%',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.two,
  },
  panel: {
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  storeRow: {
    borderRadius: 8,
    padding: Spacing.three,
  },
  storeCopy: {
    gap: Spacing.one,
  },
  button: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  buttonText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.72,
  },
});
