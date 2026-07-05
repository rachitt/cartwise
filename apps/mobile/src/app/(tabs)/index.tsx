import type { Store, StorePrice } from '@cartwise/shared';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentCart, useSearchProducts, useStores, useUpdateCartItem } from '@/api/queries';
import { CartQuantityStepper } from '@/components/cart-quantity-stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  chainLabel,
  effectivePrice,
  formatFreshnessStamp,
  formatPrice,
  formatProductSize,
} from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';

const MIN_SEARCH_LENGTH = 2;

export default function SearchScreen() {
  const zip = usePreferencesStore((state) => state.zip);
  const resetLocation = usePreferencesStore((state) => state.resetLocation);
  const [searchText, setSearchText] = useState('');
  const [submittedSearchText, setSubmittedSearchText] = useState('');
  const theme = useTheme();
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

  const canSearch =
    searchText.trim().length >= MIN_SEARCH_LENGTH &&
    activeStoreIds.length >= 1 &&
    !storesQuery.isLoading;
  const hasSearch = submittedSearchText.length >= MIN_SEARCH_LENGTH;
  const results = searchQuery.data?.results ?? [];
  const pricedResults = results.filter((result) => result.prices.length > 0);
  const sortedPricedResults = useMemo(
    () =>
      [...pricedResults].sort(
        (first, second) =>
          second.prices.length - first.prices.length ||
          lowestEffectivePrice(first.prices) - lowestEffectivePrice(second.prices),
      ),
    [pricedResults],
  );
  const storesErrorMessage = getErrorMessage(storesQuery.error);
  const searchErrorMessage = getErrorMessage(searchQuery.error);

  function submitSearch() {
    const trimmed = searchText.trim();

    if (trimmed.length < MIN_SEARCH_LENGTH || activeStoreIds.length < 1) {
      return;
    }

    setSearchText(trimmed);
    setSubmittedSearchText(trimmed);
    Keyboard.dismiss();
  }

  function clearSearch() {
    setSearchText('');
    setSubmittedSearchText('');
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          style={styles.scrollView}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.brandMark}>
                <ThemedText type="smallBold" style={styles.brandMarkText}>
                  C
                </ThemedText>
              </View>
              <View style={styles.headerCopy}>
                <ThemedText type="smallBold" themeColor="accent">
                  Cartwise
                </ThemedText>
                <ThemedText style={styles.screenTitle}>Search grocery prices</ThemedText>
              </View>
            </View>

            <View style={styles.locationRow}>
              <ThemedView type="accentMuted" style={styles.zipPill}>
                <ThemedText type="smallBold" themeColor="accent">
                  ZIP {zip}
                </ThemedText>
              </ThemedView>
              <Pressable
                accessibilityRole="button"
                onPress={resetLocation}
                style={({ pressed }) => [styles.changeLocationButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" themeColor="accent">
                  Change location
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <ThemedView type="backgroundElement" style={styles.searchPanel}>
            <ThemedText type="smallBold">Search item</ThemedText>
            <View
              style={[
                styles.searchInputShell,
                {
                  backgroundColor: theme.background,
                  borderColor: canSearch || searchText.length === 0 ? theme.border : theme.danger,
                },
              ]}>
              <TextInput
                accessibilityLabel="Search grocery item"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setSearchText}
                onSubmitEditing={submitSearch}
                placeholder="Milk, eggs, chicken, cereal"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="search"
                value={searchText}
                style={[styles.searchInput, { color: theme.text }]}
              />
              {searchText.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear item search"
                  onPress={clearSearch}
                  style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Clear
                  </ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search nearby store prices"
                disabled={!canSearch}
                onPress={submitSearch}
                style={({ pressed }) => [
                  styles.searchButton,
                  { backgroundColor: canSearch ? theme.accent : theme.backgroundSelected },
                  pressed && canSearch && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={styles.searchButtonText}>
                  Search
                </ThemedText>
              </Pressable>
            </View>

            {storesQuery.isLoading ? (
              <StatusLine message="Loading nearby stores..." />
            ) : storesQuery.isError ? (
              <ThemedText type="small" themeColor="danger">
                {storesErrorMessage}
              </ThemedText>
            ) : activeStores.length === 0 ? (
              <ThemedText type="small" themeColor="danger">
                Cartwise could not find supported grocery stores near this ZIP.
              </ThemedText>
            ) : (
              <StatusLine message={`Searching ${activeStores.length} nearby stores in ${zip}.`} />
            )}
          </ThemedView>

          <View style={styles.resultsHeader}>
            <ThemedText type="smallBold">
              {hasSearch ? `Results for "${submittedSearchText}"` : 'Results'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {searchQuery.isFetching
                ? 'Checking live prices nearby'
                : hasSearch
                  ? `${sortedPricedResults.length} products with prices`
                  : 'Search an item to see store-by-store prices.'}
            </ThemedText>
          </View>

          {searchQuery.isLoading ? (
            <SearchSkeleton />
          ) : storesQuery.isError ? (
            <EmptyState title="Nearby stores unavailable" message={storesErrorMessage} />
          ) : searchQuery.isError ? (
            <EmptyState title="Search failed" message={searchErrorMessage} />
          ) : !hasSearch ? (
            <EmptyState
              title="Search an item"
              message="Enter one grocery item. Cartwise will show nearby stores and their prices."
            />
          ) : activeStoreIds.length === 0 ? (
            <EmptyState
              title="Need nearby stores"
              message="Change location and try a ZIP with supported grocery stores."
            />
          ) : sortedPricedResults.length === 0 ? (
            <EmptyState
              title="No live prices found"
              message="Try a more common item name like milk, eggs, bread, or chicken."
            />
          ) : (
            <View style={styles.results}>
              {sortedPricedResults.map((result) => {
                const size = formatProductSize(result.product.sizeQty, result.product.sizeUnit);
                const cartItem = cartItemByProductId.get(result.product.id);
                const qty = cartItem?.qty ?? 0;

                return (
                  <ThemedView
                    key={result.product.id}
                    type="backgroundElement"
                    style={styles.resultCard}>
                    <View style={styles.productHeader}>
                      <View style={styles.productImage}>
                        {result.product.imageUrl ? (
                          <Image source={result.product.imageUrl} style={styles.image} />
                        ) : (
                          <ThemedText type="smallBold" themeColor="accent">
                            {result.product.name.slice(0, 1)}
                          </ThemedText>
                        )}
                      </View>
                      <View style={styles.resultCopy}>
                        <ThemedText type="smallBold" numberOfLines={2}>
                          {result.product.name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {result.product.brand || 'Brand unavailable'}
                        </ThemedText>
                        {size ? (
                          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                            {size}
                          </ThemedText>
                        ) : null}
                      </View>
                      <AddToCartControl
                        disabled={updateCartItem.isPending}
                        productId={result.product.id}
                        productName={result.product.name}
                        qty={qty}
                        onChange={(nextQty) =>
                          updateCartItem.mutate({ productId: result.product.id, qty: nextQty })
                        }
                      />
                    </View>

                    <View style={styles.priceTable}>
                      <ThemedText type="smallBold">Store prices</ThemedText>
                      {getStorePriceRows(activeStores, result.prices).map(({ store, price }) => (
                        <StorePriceRow
                          key={`${result.product.id}-${store.id}`}
                          price={price}
                          store={store}
                        />
                      ))}
                    </View>
                  </ThemedView>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function StorePriceRow({ store, price }: { store: Store; price: StorePrice }) {
  return (
    <View style={styles.priceRow}>
      <View style={styles.priceStore}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {store.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {chainLabel(store.chain)}
          {store.distanceMiles !== undefined ? ` · ${store.distanceMiles.toFixed(1)} mi` : ''}
        </ThemedText>
      </View>
      <View style={styles.priceMeta}>
        <ThemedText type="smallBold">{formatPrice(effectivePrice(price))}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatFreshnessStamp(price.capturedAt)}
        </ThemedText>
      </View>
    </View>
  );
}

function AddToCartControl({
  disabled,
  productId,
  productName,
  qty,
  onChange,
}: {
  disabled: boolean;
  productId: string;
  productName: string;
  qty: number;
  onChange: (qty: number) => void;
}) {
  const theme = useTheme();

  if (qty > 0) {
    return <CartQuantityStepper compact qty={qty} disabled={disabled} onChange={onChange} />;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${productName} to cart`}
      disabled={disabled}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        onChange(1);
      }}
      style={({ pressed }) => [
        styles.addButton,
        { backgroundColor: theme.accent },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <ThemedText type="smallBold" style={styles.addButtonText}>
        Add
      </ThemedText>
    </Pressable>
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

function StatusLine({ message }: { message: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {message}
    </ThemedText>
  );
}

function SearchSkeleton() {
  return (
    <View style={styles.skeletonStack}>
      <ActivityIndicator color="#16a34a" />
      {[0, 1, 2].map((item) => (
        <ThemedView key={item} type="backgroundElement" style={styles.skeletonCard} />
      ))}
    </View>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.emptyState}>
      <ThemedText type="smallBold" style={styles.emptyText}>
        {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.emptyText}>
        {message}
      </ThemedText>
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
    gap: Spacing.three,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
  },
  brandMarkText: {
    color: '#ffffff',
  },
  screenTitle: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  zipPill: {
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  changeLocationButton: {
    minHeight: 36,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  searchPanel: {
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  searchInputShell: {
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.one,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: Spacing.two,
    fontSize: 18,
    fontWeight: '700',
  },
  clearButton: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  searchButton: {
    minHeight: 44,
    minWidth: 78,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  searchButtonText: {
    color: '#ffffff',
  },
  resultsHeader: {
    gap: Spacing.one,
  },
  results: {
    gap: Spacing.three,
  },
  resultCard: {
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  productHeader: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  productImage: {
    width: 68,
    height: 68,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
  },
  image: {
    width: 68,
    height: 68,
    borderRadius: 8,
  },
  resultCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  addButton: {
    minHeight: 40,
    minWidth: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  addButtonText: {
    color: '#ffffff',
  },
  priceTable: {
    gap: Spacing.two,
  },
  priceRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  priceStore: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  priceMeta: {
    minWidth: 92,
    alignItems: 'flex-end',
  },
  skeletonStack: {
    gap: Spacing.three,
  },
  skeletonCard: {
    height: 172,
    borderRadius: 8,
    opacity: 0.7,
  },
  emptyState: {
    minHeight: 150,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.one,
  },
  emptyText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.55,
  },
});
