import type { Store, StorePrice } from '@cartwise/shared';
import type { SearchResult } from '@/api/client';
import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
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
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useCurrentCart, useSearchProducts, useStores, useUpdateCartItem } from '@/api/queries';
import { CartQuantityStepper } from '@/components/cart-quantity-stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FreshnessStamp } from '@/components/ui/freshness-stamp';
import { PriceText } from '@/components/ui/price-text';
import { ReceiptRow } from '@/components/ui/receipt-row';
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
import { chainLabel, effectivePrice, formatPrice, formatProductSize } from '@/lib/price';
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
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(() => new Set());
  const storesQuery = useStores(zip);
  const activeStores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const activeStoreIds = useMemo(() => activeStores.map((store) => store.id), [activeStores]);
  const searchQuery = useSearchProducts(submittedSearchText, activeStoreIds);
  const cartQuery = useCurrentCart();
  const updateCartItem = useUpdateCartItem();

  const cartItemByProductId = useMemo(
    () => new Map((cartQuery.data?.cart.items ?? []).map((item) => [item.productId, item])),
    [cartQuery.data?.cart.items],
  );

  const hasSearch = submittedSearchText.length >= MIN_SEARCH_LENGTH;
  const sortedPricedResults = useMemo(() => {
    const results = searchQuery.data?.results ?? [];

    return results
      .filter((result) => result.prices.length > 0)
      .sort(
        (first, second) =>
          second.prices.length - first.prices.length ||
          lowestEffectivePrice(first.prices) - lowestEffectivePrice(second.prices),
      );
  }, [searchQuery.data?.results]);
  const storesErrorMessage = getErrorMessage(storesQuery.error);
  const searchErrorMessage = getErrorMessage(searchQuery.error);
  const storeStatus = getStoreStatus({
    activeStoreCount: activeStores.length,
    errorMessage: storesErrorMessage,
    isError: storesQuery.isError,
    isLoading: storesQuery.isLoading,
    zip,
  });

  function submitSearch() {
    const trimmed = searchText.trim();

    if (trimmed.length < MIN_SEARCH_LENGTH || activeStoreIds.length < 1) {
      return;
    }

    setSearchText(trimmed);
    setSubmittedSearchText(trimmed);
    setExpandedProductIds(new Set<string>());
    Keyboard.dismiss();
  }

  function clearSearch() {
    setSearchText('');
    setSubmittedSearchText('');
    setExpandedProductIds(new Set<string>());
  }

  function toggleResult(productId: string) {
    setExpandedProductIds((current) => {
      const next = new Set(current);

      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }

      return next;
    });
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
            <View style={styles.resultsHeader}>
              <ThemedText type="eyebrow" themeColor="accent">
                RESULTS
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {sortedPricedResults.length} priced items
              </ThemedText>
            </View>

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
            ) : sortedPricedResults.length === 0 ? (
              <EmptyState
                icon={SEARCH_ICON}
                title="No live prices found"
                message="Try a common name like milk, eggs, or bread."
              />
            ) : (
              <Card flush style={styles.resultsList}>
                {sortedPricedResults.map((result, index) => {
                  const cartItem = cartItemByProductId.get(result.product.id);
                  const qty = cartItem?.qty ?? 0;

                  return (
                    <SearchResultRow
                      key={result.product.id}
                      activeStores={activeStores}
                      disabled={updateCartItem.isPending}
                      isExpanded={expandedProductIds.has(result.product.id)}
                      isLast={index === sortedPricedResults.length - 1}
                      qty={qty}
                      result={result}
                      onChangeQty={(nextQty) =>
                        updateCartItem.mutate({ productId: result.product.id, qty: nextQty })
                      }
                      onToggle={() => toggleResult(result.product.id)}
                    />
                  );
                })}
              </Card>
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

function SearchResultRow({
  activeStores,
  disabled,
  isExpanded,
  isLast,
  qty,
  result,
  onChangeQty,
  onToggle,
}: {
  activeStores: Store[];
  disabled: boolean;
  isExpanded: boolean;
  isLast: boolean;
  qty: number;
  result: SearchResult;
  onChangeQty: (qty: number) => void;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const storePriceRows = getStorePriceRows(activeStores, result.prices);
  const cheapest = storePriceRows[0];
  const worst = storePriceRows[storePriceRows.length - 1];
  const cheapestValue = cheapest ? effectivePrice(cheapest.price) : null;
  const savings =
    cheapest && worst ? effectivePrice(worst.price) - effectivePrice(cheapest.price) : 0;
  const showSavings = storePriceRows.length >= 2;
  const size = formatProductSize(result.product.sizeQty, result.product.sizeUnit);
  const metaLabel =
    [result.product.brand || 'Brand unavailable', size].filter(Boolean).join(' · ') ||
    'Details unavailable';
  const layoutTransition = reducedMotion
    ? undefined
    : LinearTransition.springify()
        .damping(Motion.spring.damping)
        .stiffness(Motion.spring.stiffness);

  return (
    <Animated.View
      layout={layoutTransition}
      style={[
        styles.resultItem,
        { borderBottomColor: theme.border },
        isLast && styles.lastResultItem,
      ]}>
      <View style={styles.resultRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} store prices for ${
            result.product.name
          }`}
          accessibilityState={{ expanded: isExpanded }}
          onPress={onToggle}
          style={({ pressed }) => [styles.resultToggle, pressed && styles.pressed]}>
          <View style={[styles.productThumb, { backgroundColor: theme.accentMuted }]}>
            {result.product.imageUrl ? (
              <Image
                source={result.product.imageUrl}
                contentFit="cover"
                style={styles.productImage}
              />
            ) : (
              <ThemedText type="smallBold" themeColor="accent">
                {result.product.name.slice(0, 1).toUpperCase()}
              </ThemedText>
            )}
          </View>
          <View style={styles.resultCopy}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {result.product.name}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {metaLabel}
            </ThemedText>
            {cheapest && cheapestValue != null ? (
              <View style={styles.priceLine}>
                <PriceText value={cheapestValue} size="sm" color="accent" />
                <ThemedText
                  type="caption"
                  themeColor="textSecondary"
                  numberOfLines={1}
                  style={styles.priceStoreText}>
                  at {cheapest.store.name}
                </ThemedText>
              </View>
            ) : (
              <ThemedText type="caption" themeColor="textSecondary">
                Price unavailable
              </ThemedText>
            )}
            {cheapest ? (
              <View style={styles.resultMetaRow}>
                {showSavings ? <Chip label={`Saves ${formatPrice(savings)}`} tone="deal" /> : null}
                <FreshnessStamp capturedAt={cheapest.price.capturedAt} />
              </View>
            ) : null}
          </View>
          <ResultChevron isExpanded={isExpanded} />
        </Pressable>
        <View style={styles.resultAction}>
          <AddToCartControl
            disabled={disabled}
            productName={result.product.name}
            qty={qty}
            onChange={onChangeQty}
          />
        </View>
      </View>

      {isExpanded ? (
        <Animated.View
          entering={reducedMotion ? FadeIn.duration(Motion.fast) : undefined}
          exiting={reducedMotion ? FadeOut.duration(Motion.fast) : undefined}
          style={[styles.expandedPrices, { borderTopColor: theme.border }]}>
          {storePriceRows.map(({ store, price }, index) => {
            const value = effectivePrice(price);
            const delta = cheapest ? value - effectivePrice(cheapest.price) : 0;

            return (
              <ReceiptRow
                key={`${result.product.id}-${store.id}`}
                capturedAt={price.capturedAt}
                deltaLabel={index === 0 ? null : `+${formatPrice(delta)}`}
                highlight={index === 0}
                meta={formatStoreMeta(store)}
                title={store.name}
                value={value}
                wasValue={price.promoPrice !== null ? price.price : null}
              />
            );
          })}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function ResultChevron({ isExpanded }: { isExpanded: boolean }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(isExpanded ? 1 : 0);

  useEffect(() => {
    const nextValue = isExpanded ? 1 : 0;

    progress.set(reducedMotion ? nextValue : withSpring(nextValue, Motion.spring));
  }, [isExpanded, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const rotation = interpolate(progress.get(), [0, 1], [0, 90]);

    return {
      transform: [{ rotate: `${rotation}deg` }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.chevron,
        reducedMotion
          ? { transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }
          : animatedStyle,
      ]}>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        tintColor={theme.textSecondary}
        size={15}
        weight="semibold"
      />
    </Animated.View>
  );
}

function AddToCartControl({
  disabled,
  productName,
  qty,
  onChange,
}: {
  disabled: boolean;
  productName: string;
  qty: number;
  onChange: (qty: number) => void;
}) {
  if (qty > 0) {
    return <CartQuantityStepper compact qty={qty} disabled={disabled} onChange={onChange} />;
  }

  return (
    <AppButton
      accessibilityLabel={`Add ${productName} to cart`}
      disabled={disabled}
      haptic="light"
      label="Add"
      onPress={(event) => {
        event.stopPropagation();
        onChange(1);
      }}
      size="md"
      style={styles.addButton}
      variant="primary"
    />
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
            index < 2 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
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

function getStorePriceRows(stores: Store[], prices: StorePrice[]) {
  const storeById = new Map(stores.map((store) => [store.id, store]));

  return prices
    .map((price) => {
      const store = storeById.get(price.storeId);
      return store ? { store, price } : null;
    })
    .filter((row): row is { store: Store; price: StorePrice } => row !== null)
    .sort((first, second) => effectivePrice(first.price) - effectivePrice(second.price));
}

function lowestEffectivePrice(prices: StorePrice[]) {
  return Math.min(...prices.map(effectivePrice));
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

function formatStoreMeta(store: Store) {
  const distance =
    store.distanceMiles === undefined ? null : `${store.distanceMiles.toFixed(1)} mi`;

  return [chainLabel(store.chain), distance].filter(Boolean).join(' · ');
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
  resultItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastResultItem: {
    borderBottomWidth: 0,
  },
  resultRow: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
  resultToggle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.three,
  },
  productThumb: {
    width: 48,
    height: 48,
    borderRadius: Radii.thumb,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productImage: {
    width: 48,
    height: 48,
    borderRadius: Radii.thumb,
  },
  resultCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minWidth: 0,
    gap: Spacing.one,
  },
  priceStoreText: {
    flexShrink: 1,
    paddingBottom: 1,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.half,
  },
  chevron: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultAction: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  addButton: {
    minWidth: 64,
  },
  expandedPrices: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
