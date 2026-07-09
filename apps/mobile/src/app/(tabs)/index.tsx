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
  withSpring,
} from 'react-native-reanimated';

import {
  useCurrentCart,
  useNearbyStores,
  useSearchProducts,
  useUpdateCartItem,
} from '@/api/queries';
import { BrandRow } from '@/components/brand-row';
import { BrandFirstSearchResults } from '@/components/search/brand-first-results';
import { SourceStatusBanner } from '@/components/source-status-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BottomTabInset,
  Elevation,
  MaxContentWidth,
  Motion,
  Radii,
  Spacing,
  type ThemeColor,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { entrance } from '@/lib/motion';
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
const XMARK_ICON = {
  ios: 'xmark',
  android: 'close',
  web: 'close',
} satisfies SymbolViewProps['name'];
const ARROW_ICON = {
  ios: 'arrow.right',
  android: 'arrow_forward',
  web: 'arrow_forward',
} satisfies SymbolViewProps['name'];

export default function SearchScreen() {
  const zip = usePreferencesStore((state) => state.zip);
  const resetLocation = usePreferencesStore((state) => state.resetLocation);
  const [searchText, setSearchText] = useState('');
  const [submittedSearchText, setSubmittedSearchText] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const lastCompletedSearchSignature = useRef<string | null>(null);
  const storesQuery = useNearbyStores(zip);
  const activeStores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const activeStoreIds = useMemo(() => activeStores.map((store) => store.id), [activeStores]);
  const searchQuery = useSearchProducts(submittedSearchText, activeStoreIds);
  const cartQuery = useCurrentCart();
  const updateCartItem = useUpdateCartItem();
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

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
            <BrandRow
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Change location, currently ZIP ${zip}`}
                  hitSlop={8}
                  onPress={resetLocation}
                  style={({ pressed }) => [styles.statusZipButton, pressed && styles.pressed]}>
                  <Chip label={`ZIP ${zip}`} tone="accent" />
                </Pressable>
              }
            />
            <ThemedText type="display" style={styles.title}>
              Build your cart
            </ThemedText>
            <View style={styles.storeStatusRow}>
              <View style={[styles.statusDot, { backgroundColor: theme[storeStatus.tone] }]} />
              <ThemedText
                type="small"
                themeColor={storeStatus.tone}
                numberOfLines={2}
                style={styles.statusText}>
                {storeStatus.message}
              </ThemedText>
            </View>
          </View>

          <SearchField
            canSubmit={searchText.trim().length >= MIN_SEARCH_LENGTH && activeStoreIds.length > 0}
            value={searchText}
            onChangeText={setSearchText}
            onClear={clearSearch}
            onSubmit={submitSearch}
          />

          <Animated.View
            key={hasSearch ? searchRequestSignature : 'search-idle'}
            entering={entrance(0, reducedMotion)}
            style={styles.resultsSection}>
            {!shouldUseBrandFlow ? (
              <View style={styles.resultsHeader}>
                <ThemedText type="eyebrow" themeColor="accent">
                  RESULTS
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {pricedResults.length} items
                </ThemedText>
              </View>
            ) : null}

            {hasSearch ? (
              <SourceStatusBanner sources={searchQuery.data?.sources} stores={activeStores} />
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
                message="One item at a time. Cartwise checks every store nearby when you are ready."
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
                title="No matching items found"
                message="Try a common name like milk, eggs, or bread."
              />
            ) : (
              <BrandFirstSearchResults
                disabled={updateCartItem.isPending}
                qtyByProductId={cartQtyByProductId}
                results={pricedResults}
                selectedBrand={selectedBrand}
                onBackToBrands={() => setSelectedBrand(null)}
                onChangeQty={(productId, qty) => updateCartItem.mutate({ productId, qty })}
                onSelectBrand={setSelectedBrand}
              />
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SearchField({
  canSubmit,
  value,
  onChangeText,
  onClear,
  onSubmit,
}: {
  canSubmit: boolean;
  value: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const focusProgress = useSharedValue(0);

  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focusProgress.get(),
      [0, 1],
      [theme.backgroundElement, theme.accent],
    ),
    transform: [{ scale: reducedMotion ? 1 : 1 + focusProgress.get() * 0.01 }],
  }));

  function setFocusProgress(nextValue: number) {
    focusProgress.set(reducedMotion ? nextValue : withSpring(nextValue, Motion.springGentle));
  }

  return (
    <Animated.View
      style={[
        styles.searchField,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.backgroundElement,
          shadowColor: theme.shadow,
        },
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
          <SymbolView name={XMARK_ICON} tintColor={theme.textSecondary} size={14} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search item"
        accessibilityState={{ disabled: !canSubmit }}
        disabled={!canSubmit}
        hitSlop={8}
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.submitButton,
          { backgroundColor: canSubmit ? theme.accent : theme.backgroundSelected },
          pressed && styles.pressed,
          !canSubmit && styles.disabledSubmit,
        ]}>
        <SymbolView
          name={ARROW_ICON}
          tintColor={canSubmit ? theme.onAccent : theme.textSecondary}
          size={17}
          weight="semibold"
        />
      </Pressable>
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
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.two,
  },
  title: {
    flexShrink: 1,
  },
  storeStatusRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusZipButton: {
    flexShrink: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: Radii.chip,
  },
  statusText: {
    flex: 1,
    minWidth: 0,
  },
  searchField: {
    height: 64,
    borderRadius: Radii.chip,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    ...Elevation.card,
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
  submitButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledSubmit: {
    opacity: 0.65,
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
