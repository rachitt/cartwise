import type { CartOptimization, Store } from '@cartwise/shared';
import { useQueryClient } from '@tanstack/react-query';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { router } from 'expo-router';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CartItem } from '@/api/client';
import { cartOptimizationQueryKey, useCurrentCart, useStores } from '@/api/queries';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FreshnessStamp } from '@/components/ui/freshness-stamp';
import { PriceText } from '@/components/ui/price-text';
import { ReceiptRow } from '@/components/ui/receipt-row';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Motion, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tapLight } from '@/lib/haptics';
import { chainLabel, formatPrice, formatProductSize } from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';

const RESULTS_EMPTY_ICON = {
  ios: 'cart.badge.questionmark',
  android: 'shopping_cart',
  web: 'shopping_cart',
} satisfies SymbolViewProps['name'];

const WARNING_ICON = {
  ios: 'exclamationmark.triangle',
  android: 'warning',
  web: 'warning',
} satisfies SymbolViewProps['name'];

const reasonLabel: Record<CartOptimization['swapSuggestions'][number]['reason'], string> = {
  'cheaper-brand': 'Cheaper brand',
  'better-unit-price': 'Better unit price',
};

export default function CartResultsScreen() {
  const queryClient = useQueryClient();
  const optimization = queryClient.getQueryData<CartOptimization>(cartOptimizationQueryKey);
  const zip = usePreferencesStore((state) => state.zip);
  const cartQuery = useCurrentCart();
  const storesQuery = useStores(zip);
  const theme = useTheme();

  const stores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const cartItems = useMemo(
    () => cartQuery.data?.cart.items ?? [],
    [cartQuery.data?.cart.items],
  );
  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const productById = useMemo(
    () => new Map(cartItems.map((item) => [item.productId, item.product])),
    [cartItems],
  );
  const rankedStoreTotals = useMemo(
    () => rankStoreTotals(optimization),
    [optimization],
  );
  const cheaperElsewhereByProductId = useMemo(
    () => groupCheaperElsewhere(optimization),
    [optimization],
  );

  if (!optimization) {
    return (
      <ScreenShell>
        <TopBar />
        <EmptyState
          icon={RESULTS_EMPTY_ICON}
          title="No cart results yet"
          message="Finalize your cart to compare totals across nearby stores."
          action={{ label: 'Back to cart', onPress: () => router.replace('/cart') }}
        />
      </ScreenShell>
    );
  }

  if (cartQuery.isError || storesQuery.isError) {
    return (
      <ScreenShell>
        <TopBar />
        <EmptyState
          icon={WARNING_ICON}
          title="Could not load results"
          message="The cart finished, but store or item details are unavailable."
          action={{ label: 'Back to cart', onPress: () => router.replace('/cart') }}
        />
      </ScreenShell>
    );
  }

  const winningStore = storeById.get(optimization.winningStoreId);

  return (
    <ScreenShell>
      <TopBar />

      <HeroCard optimization={optimization} winningStore={winningStore} />

      {cartQuery.isLoading || storesQuery.isLoading ? (
        <ResultsSkeleton />
      ) : (
        <>
          <View style={styles.section}>
            <ThemedText type="eyebrow">STORE TOTALS</ThemedText>
            <Card flush>
              {rankedStoreTotals.map((storeTotal, index) => {
                const store = storeById.get(storeTotal.storeId);
                const isWinner = storeTotal.storeId === optimization.winningStoreId;
                const meta = formatStoreTotalMeta(store, storeTotal.missingItems.length);
                const delta = Math.max(0, storeTotal.total - optimization.winningTotal);

                return (
                  <ReceiptRow
                    key={storeTotal.storeId}
                    title={store?.name ?? storeTotal.storeId}
                    meta={meta}
                    value={storeTotal.total}
                    capturedAt={optimization.pricesAsOf}
                    highlight={isWinner}
                    deltaLabel={isWinner ? null : `+${formatPrice(delta)}`}
                    style={[
                      styles.receiptRow,
                      index < rankedStoreTotals.length - 1 && styles.rowSeparator,
                      index < rankedStoreTotals.length - 1 && { borderBottomColor: theme.border },
                    ]}
                  />
                );
              })}
            </Card>
          </View>

          <View style={styles.section}>
            <ThemedText type="eyebrow">CART ITEMS</ThemedText>
            <Card flush>
              {cartItems.length > 0 ? (
                cartItems.map((item, index) => (
                  <CartItemResultRow
                    key={item.productId}
                    cheaperFlags={cheaperElsewhereByProductId.get(item.productId) ?? []}
                    item={item}
                    showSeparator={index < cartItems.length - 1}
                    storeById={storeById}
                  />
                ))
              ) : (
                <View style={styles.emptyCardRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Cart item details are unavailable for this result.
                  </ThemedText>
                </View>
              )}
            </Card>
          </View>

          <View style={styles.section}>
            <ThemedText type="eyebrow">SWAP SUGGESTIONS</ThemedText>
            {optimization.swapSuggestions.length > 0 ? (
              optimization.swapSuggestions.map((suggestion) => {
                const fromProduct = productById.get(suggestion.fromProductId);

                return (
                  <Card
                    key={`${suggestion.fromProductId}-${suggestion.toProductId}`}
                    style={styles.swapRow}>
                    <View style={styles.swapCopy}>
                      <ThemedText type="smallBold" numberOfLines={2}>
                        {fromProduct?.name ?? formatProductId(suggestion.fromProductId)} →{' '}
                        {formatProductId(suggestion.toProductId)}
                      </ThemedText>
                      <Chip label={reasonLabel[suggestion.reason]} tone="neutral" />
                    </View>
                    <Chip label={`Save ${formatPrice(suggestion.savings)}`} tone="deal" />
                  </Card>
                );
              })
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptySwapsText}>
                No strong swaps found — this cart is already tight.
              </ThemedText>
            )}
          </View>
        </>
      )}
    </ScreenShell>
  );
}

function ScreenShell({ children }: { children: ReactNode }) {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function TopBar() {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to cart"
      hitSlop={8}
      onPress={() => {
        tapLight();
        router.back();
      }}
      style={({ pressed }) => [
        styles.backControl,
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <SymbolView name="chevron.left" tintColor={theme.accent} size={16} />
      <ThemedText type="smallBold" themeColor="accent">
        Cart
      </ThemedText>
    </Pressable>
  );
}

function HeroCard({
  optimization,
  winningStore,
}: {
  optimization: CartOptimization;
  winningStore?: Store;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(reducedMotion ? 0 : Spacing.three);

  useEffect(() => {
    opacity.set(withTiming(1, { duration: reducedMotion ? Motion.base : Motion.fast }));
    translateY.set(reducedMotion ? 0 : withSpring(0, Motion.spring));
  }, [opacity, reducedMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: reducedMotion ? 0 : translateY.get() }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Card
        style={[
          styles.heroCard,
          { backgroundColor: theme.accentMuted, borderColor: theme.accent },
        ]}>
        <ThemedText type="eyebrow" themeColor="accent">
          YOUR CHEAPEST STORE
        </ThemedText>
        <View style={styles.heroTitleBlock}>
          <ThemedText type="title" numberOfLines={2}>
            {winningStore?.name ?? 'Selected store'}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {winningStore ? chainLabel(winningStore.chain) : optimization.winningStoreId}
          </ThemedText>
        </View>
        <PriceText value={optimization.winningTotal} size="hero" color="accent" />
        <View style={styles.heroMetaRow}>
          {optimization.savings > 0 ? (
            <Chip
              label={`Saves ${formatPrice(optimization.savings)} vs the priciest cart`}
              tone="deal"
            />
          ) : null}
          <FreshnessStamp capturedAt={optimization.pricesAsOf} />
        </View>
      </Card>
    </Animated.View>
  );
}

function CartItemResultRow({
  cheaperFlags,
  item,
  showSeparator,
  storeById,
}: {
  cheaperFlags: NonNullable<CartOptimization['cheaperElsewhere']>;
  item: CartItem;
  showSeparator: boolean;
  storeById: Map<string, Store>;
}) {
  const theme = useTheme();
  const size = formatProductSize(item.product.sizeQty, item.product.sizeUnit);
  const meta = [item.product.brand, size, `Qty ${item.qty}`].filter(Boolean).join(' · ');

  return (
    <View
      style={[
        styles.cartItemRow,
        showSeparator && styles.rowSeparator,
        showSeparator && { borderBottomColor: theme.border },
      ]}>
      <View style={styles.cartItemCopy}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {item.product.name}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {meta}
        </ThemedText>
      </View>
      {cheaperFlags.length > 0 ? (
        <View style={styles.itemChipStack}>
          {cheaperFlags.map((flag) => {
            const store = storeById.get(flag.storeId);

            return (
              <Chip
                key={`${flag.productId}-${flag.storeId}`}
                label={`Cheaper at ${store?.name ?? flag.storeId}`}
                tone="neutral"
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function ResultsSkeleton() {
  const theme = useTheme();

  return (
    <View style={styles.skeletonStack}>
      {[0, 1].map((section) => (
        <View key={section} style={styles.section}>
          <Skeleton height={16} width={128} />
          <Card flush>
            {[0, 1, 2].map((row, index) => (
              <View
                key={row}
                style={[
                  styles.skeletonRow,
                  index < 2 && styles.rowSeparator,
                  index < 2 && { borderBottomColor: theme.border },
                ]}>
                <View style={styles.skeletonCopy}>
                  <Skeleton height={16} width="68%" />
                  <Skeleton height={12} width="44%" />
                </View>
                <Skeleton height={28} width={72} radius={Radii.control} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

function rankStoreTotals(optimization?: CartOptimization) {
  if (!optimization) {
    return [];
  }

  return [...optimization.perStoreTotals].sort((first, second) => {
    if (first.storeId === optimization.winningStoreId) {
      return -1;
    }
    if (second.storeId === optimization.winningStoreId) {
      return 1;
    }

    return first.total - second.total;
  });
}

function groupCheaperElsewhere(optimization?: CartOptimization) {
  const grouped = new Map<string, CartOptimization['cheaperElsewhere']>();

  for (const flag of optimization?.cheaperElsewhere ?? []) {
    const flags = grouped.get(flag.productId) ?? [];
    flags.push(flag);
    grouped.set(flag.productId, flags);
  }

  return grouped;
}

function formatStoreTotalMeta(store: Store | undefined, missingItems: number) {
  const label = store ? chainLabel(store.chain) : 'Selected store';
  return missingItems > 0 ? `${label} · ${formatMissingItems(missingItems)}` : label;
}

function formatMissingItems(count: number) {
  return `${count} ${count === 1 ? 'item' : 'items'} missing`;
}

function formatProductId(productId: string) {
  return productId
    .split('-')
    .filter((part) => part !== 'store')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
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
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  backControl: {
    minHeight: 44,
    alignSelf: 'flex-start',
    borderRadius: Radii.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingRight: Spacing.three,
  },
  heroCard: {
    borderWidth: 1,
    gap: Spacing.three,
  },
  heroTitleBlock: {
    gap: Spacing.one,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  receiptRow: {
    borderRadius: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cartItemRow: {
    minHeight: 68,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cartItemCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  itemChipStack: {
    alignItems: 'flex-end',
    gap: Spacing.one,
    flexShrink: 1,
  },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  swapCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.two,
  },
  emptySwapsText: {
    paddingVertical: Spacing.one,
  },
  emptyCardRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  skeletonStack: {
    gap: Spacing.three,
  },
  skeletonRow: {
    minHeight: 68,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  skeletonCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.two,
  },
});
