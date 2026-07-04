import type { StorePrice } from '@cartwise/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { effectivePrice, formatPrice, formatProductSize, storeBadge } from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';
import { useTheme } from '@/hooks/use-theme';

export default function SearchScreen() {
  const zip = usePreferencesStore((state) => state.zip);
  const selectedStoreIds = usePreferencesStore((state) => state.selectedStoreIds);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const theme = useTheme();
  const storesQuery = useStores(zip);
  const searchQuery = useSearchProducts(debouncedSearchText, selectedStoreIds);
  const cartQuery = useCurrentCart();
  const updateCartItem = useUpdateCartItem();

  const storeById = useMemo(
    () => new Map((storesQuery.data?.stores ?? []).map((store) => [store.id, store])),
    [storesQuery.data?.stores],
  );
  const cartItemByProductId = useMemo(
    () => new Map((cartQuery.data?.cart.items ?? []).map((item) => [item.productId, item])),
    [cartQuery.data?.cart.items],
  );

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearchText(searchText), 300);
    return () => clearTimeout(timeout);
  }, [searchText]);

  const hasSearch = debouncedSearchText.trim().length >= 2;
  const results = searchQuery.data?.results ?? [];

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          style={styles.scrollView}>
          <View style={styles.header}>
            <ThemedText type="smallBold" themeColor="accent">
              Cartwise Search
            </ThemedText>
            <ThemedText type="subtitle">Compare one grocery item</ThemedText>
            <ThemedText themeColor="textSecondary">
              Search staples and see the cheapest selected store at a glance.
            </ThemedText>
          </View>

          <TextInput
            accessibilityLabel="Search groceries"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Search milk, eggs, pasta..."
            placeholderTextColor={theme.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
            style={[
              styles.searchInput,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          />

          {searchQuery.isLoading ? (
            <SearchSkeleton />
          ) : !hasSearch ? (
            <EmptyState message="Search for an item to compare nearby prices." />
          ) : results.length === 0 ? (
            <EmptyState message="No prices found nearby" />
          ) : (
            <View style={styles.results}>
              {results.map((result) => {
                const cheapest = getCheapestPrice(result.prices);
                const store = cheapest ? storeById.get(cheapest.storeId) : undefined;
                const size = formatProductSize(result.product.sizeQty, result.product.sizeUnit);
                const cartItem = cartItemByProductId.get(result.product.id);
                const qty = cartItem?.qty ?? 0;

                return (
                  <Pressable
                    key={result.product.id}
                    onPress={() =>
                      router.push({
                        pathname: '/products/[id]',
                        params: { id: result.product.id },
                      })
                    }
                    style={({ pressed }) => pressed && styles.pressed}>
                    <ThemedView type="backgroundElement" style={styles.resultCard}>
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
                        <ThemedText type="smallBold">{result.product.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {[result.product.brand, size].filter(Boolean).join(' · ')}
                        </ThemedText>
                      </View>
                      <View style={styles.priceBlock}>
                        {cheapest ? (
                          <>
                            <ThemedText type="smallBold" themeColor="accent">
                              {formatPrice(effectivePrice(cheapest))}
                            </ThemedText>
                            <ThemedView type="accentMuted" style={styles.badge}>
                              <ThemedText type="smallBold" themeColor="accent">
                                {storeBadge(store)}
                              </ThemedText>
                            </ThemedView>
                          </>
                        ) : (
                          <ThemedText type="small" themeColor="textSecondary">
                            No prices
                          </ThemedText>
                        )}
                        {qty > 0 ? (
                          <CartQuantityStepper
                            compact
                            qty={qty}
                            disabled={updateCartItem.isPending}
                            onChange={(nextQty) =>
                              updateCartItem.mutate({ productId: result.product.id, qty: nextQty })
                            }
                          />
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${result.product.name} to cart`}
                            disabled={updateCartItem.isPending}
                            onPress={(event: GestureResponderEvent) => {
                              event.stopPropagation();
                              updateCartItem.mutate({ productId: result.product.id, qty: 1 });
                            }}
                            style={({ pressed }) => [
                              styles.addButton,
                              { backgroundColor: theme.accent },
                              pressed && styles.pressed,
                              updateCartItem.isPending && styles.disabled,
                            ]}>
                            <ThemedText type="smallBold" style={styles.addButtonText}>
                              Add
                            </ThemedText>
                          </Pressable>
                        )}
                      </View>
                    </ThemedView>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function getCheapestPrice(prices: StorePrice[]) {
  return [...prices].sort((first, second) => effectivePrice(first) - effectivePrice(second))[0];
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

function EmptyState({ message }: { message: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.emptyState}>
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
    gap: Spacing.two,
  },
  searchInput: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    fontWeight: '600',
  },
  results: {
    gap: Spacing.three,
  },
  resultCard: {
    minHeight: 92,
    borderRadius: 8,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  productImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcfce7',
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  resultCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  priceBlock: {
    alignItems: 'flex-end',
    gap: Spacing.one,
    minWidth: 104,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  pressed: {
    opacity: 0.72,
  },
  addButton: {
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  addButtonText: {
    color: '#ffffff',
  },
  disabled: {
    opacity: 0.5,
  },
  skeletonStack: {
    gap: Spacing.three,
  },
  skeletonCard: {
    height: 92,
    borderRadius: 8,
  },
  emptyState: {
    minHeight: 180,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  emptyText: {
    textAlign: 'center',
  },
});
