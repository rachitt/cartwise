import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import Constants from 'expo-constants';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNearbyStores } from '@/api/queries';
import { BrandRow } from '@/components/brand-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { PressableScale } from '@/components/ui/pressable-scale';
import { BottomTabInset, MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chainLabel } from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';

const LOCATION_ICON = {
  ios: 'location.fill',
  android: 'location_on',
  web: 'location_on',
} satisfies SymbolViewProps['name'];

const STORE_ICON = {
  ios: 'storefront',
  android: 'storefront',
  web: 'storefront',
} satisfies SymbolViewProps['name'];

const CHEVRON_ICON = {
  ios: 'chevron.right',
  android: 'chevron_right',
  web: 'chevron_right',
} satisfies SymbolViewProps['name'];

export default function SettingsScreen() {
  const zip = usePreferencesStore((state) => state.zip);
  const resetLocation = usePreferencesStore((state) => state.resetLocation);
  const storesQuery = useNearbyStores(zip);
  const theme = useTheme();
  const activeStores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
          <View style={styles.header}>
            <BrandRow />
            <ThemedText type="display">Settings</ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText type="eyebrow">LOCATION</ThemedText>
            <Card flush>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Change location, currently ${zip || 'not set'}`}
                onPress={resetLocation}
                style={styles.settingRow}>
                <IconWell icon={LOCATION_ICON} />
                <View style={styles.rowCopy}>
                  <ThemedText type="smallBold">ZIP code</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {zip || 'Not set'}
                  </ThemedText>
                </View>
                <SymbolView name={CHEVRON_ICON} tintColor={theme.textSecondary} size={18} />
              </PressableScale>
            </Card>
          </View>

          <View style={styles.section}>
            <SectionHeader label="NEARBY STORES" count={`${activeStores.length} stores`} />
            <Card flush>
              {activeStores.length > 0 ? (
                activeStores.map((store, index) => (
                  <View
                    key={store.id}
                    style={[
                      styles.settingRow,
                      index > 0 && styles.rowDivider,
                      index > 0 && { borderTopColor: theme.border },
                    ]}>
                    <IconWell icon={STORE_ICON} />
                    <View style={styles.rowCopy}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {store.name}
                      </ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                        {chainLabel(store.chain)} · {formatDistance(store.distanceMiles)} mi
                      </ThemedText>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.settingRow}>
                  <IconWell icon={STORE_ICON} />
                  <ThemedText type="caption" themeColor="textSecondary" style={styles.rowCopy}>
                    Cartwise is comparing all nearby stores for this location.
                  </ThemedText>
                </View>
              )}
            </Card>
          </View>

          <View style={styles.footer}>
            {Constants.expoConfig?.version ? (
              <ThemedText type="caption" themeColor="textSecondary" style={styles.footerText}>
                Cartwise {Constants.expoConfig.version}
              </ThemedText>
            ) : null}
            <ThemedText type="caption" themeColor="textSecondary" style={styles.footerText}>
              Cartwise compares Kroger, Walmart, Target, and ALDI. Prices are cached briefly and
              always stamped.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function IconWell({ icon }: { icon: SymbolViewProps['name'] }) {
  const theme = useTheme();
  return (
    <View style={[styles.iconWell, { backgroundColor: theme.accentMuted }]}>
      <SymbolView name={icon} tintColor={theme.accent} size={18} />
    </View>
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
  screen: { flex: 1 },
  safeArea: { flex: 1, alignItems: 'center' },
  scrollView: { width: '100%' },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.four,
  },
  header: { gap: Spacing.one },
  section: { gap: Spacing.two },
  sectionHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  settingRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: Radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, minWidth: 0, gap: Spacing.half },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  footer: { gap: Spacing.one, paddingBottom: Spacing.two },
  footerText: { textAlign: 'center' },
});
