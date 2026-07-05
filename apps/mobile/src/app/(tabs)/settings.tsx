import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStores } from '@/api/queries';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chainLabel } from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';

export default function SettingsScreen() {
  const zip = usePreferencesStore((state) => state.zip);
  const resetLocation = usePreferencesStore((state) => state.resetLocation);
  const storesQuery = useStores(zip);
  const theme = useTheme();

  const activeStores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
          <View style={styles.header}>
            <ThemedText type="eyebrow">CARTWISE</ThemedText>
            <ThemedText type="display">Settings</ThemedText>
          </View>

          <Card style={styles.locationCard}>
            <View style={styles.locationCopy}>
              <ThemedText type="eyebrow">LOCATION</ThemedText>
              <ThemedText type="title" themeColor={zip ? 'text' : 'textSecondary'}>
                {zip || 'Not set'}
              </ThemedText>
            </View>
            <AppButton
              label="Change location"
              variant="secondary"
              onPress={resetLocation}
              style={styles.locationButton}
            />
          </Card>

          <View style={styles.section}>
            <SectionHeader label="NEARBY STORES" count={`${activeStores.length} stores`} />

            <Card flush>
              {activeStores.length > 0 ? (
                activeStores.map((store, index) => (
                  <View
                    key={store.id}
                    style={[
                      styles.storeRow,
                      index > 0 && styles.rowDivider,
                      index > 0 && { borderTopColor: theme.border },
                    ]}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {store.name}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                      {chainLabel(store.chain)} · {formatDistance(store.distanceMiles)} mi
                    </ThemedText>
                  </View>
                ))
              ) : (
                <View style={styles.storeRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Cartwise is comparing all nearby stores for this location.
                  </ThemedText>
                </View>
              )}
            </Card>
          </View>

          <ThemedText type="stamp" style={styles.footer}>
            Cartwise compares Kroger, Walmart, Target, and ALDI. Prices are cached briefly and
            always stamped.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SectionHeader({ label, count }: { label: string; count: string }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="eyebrow">{label}</ThemedText>
      <ThemedText type="caption" themeColor="textSecondary">
        {count}
      </ThemedText>
    </View>
  );
}

function formatDistance(distanceMiles: number | undefined) {
  return distanceMiles?.toFixed(1) ?? '--';
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
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  locationCard: {
    gap: Spacing.three,
  },
  locationCopy: {
    gap: Spacing.one,
  },
  locationButton: {
    alignSelf: 'flex-start',
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  storeRow: {
    minHeight: 64,
    justifyContent: 'center',
    gap: Spacing.one,
    padding: Spacing.three,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    paddingBottom: Spacing.two,
  },
});
