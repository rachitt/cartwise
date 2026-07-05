import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useCurrentCart, useSearchProducts, useStores, useUpdateCartItem } from '@/api/queries';
import { BrandFirstSearchResults } from '@/components/search/brand-first-results';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BottomTabInset,
  MaxContentWidth,
  Motion,
  Radii,
  Spacing,
  type ThemeColor,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePreferencesStore } from '@/state/preferences';

const MIN_SEARCH_LENGTH = 2;
const SEARCH_ICON = {
  ios: 'magnifyingglass',
  android: 'search',
  web: 'search',
} satisfies SymbolViewProps['name'];
const WARNING_ICON = {
  ios: 'exclamationmark.triangle',
  android: 'warning',
  web: 'warning',
} satisfies SymbolViewProps['name'];

export default function SearchScreen() {
  const zip = usePreferencesStore((state) => state.zip);
  const resetLocation = usePreferencesStore((state) => state.resetLocation);
  const [searchText, setSearchText] = useState('');
  const [submittedSearchText, setSubmittedSearchText] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const lastCompletedSearchSignature = useRef<string | null>(null);
  const storesQuery = useStores(zip);
  const activeStores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const activeStoreIds = useMemo(() => activeStores.map((store) => store.id), [activeStores]);
  const searchQuery = useSearchProducts(submittedSearchText, activeStoreIds);
  const cartQuery = useCurrentCart();
  const updateCartItem = useUpdateCartItem();

  const cartQtyByProductId = useMemo(
    () => new Map((cartQuery.data?.cart.items ?? []).map((item) => [item.productId, item.qty])),
    [cartQuery.data?.cart.items],
  );

  const hasSearch = submittedSearchText.length >= MIN_SEARCH_LENGTH;
  const pricedResults = useMemo(() => {
    const results = searchQuery.data?.results ?? [];

    return results.filter((result) => result.prices.length > 0);
  }, [searchQuery.data?.results]);
  const shouldUseBrandFlow =
    hasSearch &&
    !searchQuery.isLoading &&
    !storesQuery.isError &&
    !searchQuery.isError &&
    activeStoreIds.length > 0 &&
    pricedResults.length > 0;
  const searchRequestSignature = `${submittedSearchText}:${activeStoreIds.join('|')}`;
  const storesErrorMessage = getErrorMessage(storesQuery.error);
  const searchErrorMessage = getErrorMessage(searchQuery.error);
  const storeStatus = getStoreStatus({
    activeStoreCount: activeStores.length,
    errorMessage: storesErrorMessage,
    isError: storesQuery.isError,
    isLoading: storesQuery.isLoading,
    zip,
  });

  useEffect(() => {
    if (!searchQuery.data || lastCompletedSearchSignature.current === searchRequestSignature) {
      return;
    }

    lastCompletedSearchSignature.current = searchRequestSignature;
    setSelectedBrand(null);
  }, [searchQuery.data, searchRequestSignature]);

  function submitSearch() {
    const trimmed = searchText.trim();

    if (trimmed.length < MIN_SEARCH_LENGTH || activeStoreIds.length < 1) {
      return;
    }

    setSearchText(trimmed);
    setSubmittedSearchText(trimmed);
    setSelectedBrand(null);
    Keyboard.dismiss();
  }

  function clearSearch() {
    setSearchText('');
    setSubmittedSearchText('');
    setSelectedBrand(null);
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          style={styles.scrollView}>
          <View style={styles.header}>
            <ThemedText type="eyebrow" themeColor="accent">
              CARTWISE
            </ThemedText>
            <View style={styles.titleRow}>
              <ThemedText type="display" style={styles.title}>
                Search
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Change location, currently ZIP ${zip}`}
                hitSlop={8}
                onPress={resetLocation}
                style={({ pressed }) => [styles.zipButton, pressed && styles.pressed]}>
                <Chip label={`ZIP ${zip}`} tone="accent" />
              </Pressable>
            </View>
            <ThemedText type="small" themeColor={storeStatus.tone}>
              {storeStatus.message}
            </ThemedText>
          </View>

          <SearchField
            value={searchText}
            onChangeText={setSearchText}
            onClear={clearSearch}
            onSubmit={submitSearch}
          />

          <View style={styles.resultsSection}>
            {!shouldUseBrandFlow ? (
              <View style={styles.resultsHeader}>
                <ThemedText type="eyebrow" themeColor="accent">
                  RESULTS
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {pricedResults.length} priced items
                </ThemedText>
              </View>
            ) : null}

            {hasSearch && searchQuery.isLoading ? (
              <SearchSkeletonList />
            ) : storesQuery.isError ? (
              <EmptyState
                icon={WARNING_ICON}
                title="Nearby stores unavailable"
                message={storesErrorMessage}
              />
            ) : searchQuery.isError ? (
              <EmptyState icon={WARNING_ICON} title="Search failed" message={searchErrorMessage} />
            ) : !hasSearch ? (
              <EmptyState
                icon={SEARCH_ICON}
                title="Search an item"
                message="One item at a time — Cartwise compares every store nearby."
              />
            ) : activeStoreIds.length === 0 ? (
              <EmptyState
                icon={WARNING_ICON}
                title="Need nearby stores"
                message="Change location and try a ZIP with supported grocery stores."
              />
            ) : pricedResults.length === 0 ? (
              <EmptyState
                icon={SEARCH_ICON}
                title="No live prices found"
                message="Try a common name like milk, eggs, or bread."
              />
            ) : (
              <BrandFirstSearchResults
                activeStores={activeStores}
                disabled={updateCartItem.isPending}
                qtyByProductId={cartQtyByProductId}
                results={pricedResults}
                selectedBrand={selectedBrand}
                onBackToBrands={() => setSelectedBrand(null)}
                onChangeQty={(productId, qty) => updateCartItem.mutate({ productId, qty })}
                onSelectBrand={setSelectedBrand}
              />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SearchField({
  value,
  onChangeText,
  onClear,
  onSubmit,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const focusProgress = useSharedValue(0);

  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focusProgress.get(), [0, 1], [theme.border, theme.accent]),
  }));

  function setFocusProgress(nextValue: number) {
    focusProgress.set(
      reducedMotion ? nextValue : withTiming(nextValue, { duration: Motion.fast }),
    );
  }

  return (
    <Animated.View
      style={[
        styles.searchField,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        animatedBorderStyle,
      ]}>
      <SymbolView name={SEARCH_ICON} tintColor={theme.textSecondary} size={20} />
      <TextInput
        accessibilityLabel="Search grocery item"
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={() => setFocusProgress(0)}
        onChangeText={onChangeText}
        onFocus={() => setFocusProgress(1)}
        onSubmitEditing={onSubmit}
        placeholder="Milk, eggs, olive oil…"
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        selectionColor={theme.accent}
        style={[styles.searchInput, { color: theme.text }]}
        value={value}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear item search"
          hitSlop={8}
          onPress={onClear}
          style={({ pressed }) => [
            styles.clearButton,
            { backgroundColor: theme.backgroundSelected },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="caption" themeColor="textSecondary" style={styles.clearGlyph}>
            ✕
          </ThemedText>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function SearchSkeletonList() {
  const theme = useTheme();

  return (
    <Card flush style={styles.resultsList}>
      {[0, 1, 2].map((item, index) => (
        <View
          key={item}
          style={[
            styles.skeletonRow,
            index < 2 && {
              borderBottomColor: theme.border,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}>
          <Skeleton height={48} width={48} radius={Radii.thumb} />
          <View style={styles.skeletonCopy}>
            <Skeleton height={16} width="74%" />
            <Skeleton height={12} width="54%" />
            <Skeleton height={16} width="66%" />
          </View>
          <Skeleton height={44} width={64} radius={Radii.control} />
        </View>
      ))}
    </Card>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Cartwise could not reach the live price API.';
}

function getStoreStatus({
  activeStoreCount,
  errorMessage,
  isError,
  isLoading,
  zip,
}: {
  activeStoreCount: number;
  errorMessage: string;
  isError: boolean;
  isLoading: boolean;
  zip: string;
}): { message: string; tone: ThemeColor } {
  if (isLoading) {
    return { message: 'Loading nearby stores...', tone: 'textSecondary' };
  }

  if (isError) {
    return { message: errorMessage, tone: 'danger' };
  }

  if (activeStoreCount === 0) {
    return {
      message: 'Cartwise could not find supported grocery stores near this ZIP.',
      tone: 'danger',
    };
  }

  return { message: `Comparing ${activeStoreCount} stores near ${zip}`, tone: 'textSecondary' };
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  title: {
    flexShrink: 1,
  },
  zipButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  searchField: {
    minHeight: 56,
    borderRadius: Radii.chip,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: 0,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: Radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearGlyph: {
    lineHeight: 16,
  },
  resultsSection: {
    gap: Spacing.two,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  resultsList: {
    width: '100%',
  },
  skeletonRow: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  skeletonCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
});
