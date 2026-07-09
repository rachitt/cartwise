import type { Store } from '@cartwise/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import {
  useCurrentCart,
  useNearbyStores,
  useProductPrices,
  useUpdateCartItem,
} from '@/api/queries';
import { CartQuantityStepper } from '@/components/cart-quantity-stepper';
import { SourceStatusBanner } from '@/components/source-status-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ReceiptRow } from '@/components/ui/receipt-row';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { entrance } from '@/lib/motion';
import { chainLabel, formatProductSize } from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';

const BACK_ICON = {
  ios: 'chevron.left',
  android: 'chevron_left',
  web: 'chevron_left',
} satisfies SymbolViewProps['name'];

const SEARCH_ICON = {
  ios: 'magnifyingglass',
  android: 'search',
  web: 'search',
} satisfies SymbolViewProps['name'];

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Array.isArray(id) ? id[0] : id;
  const zip = usePreferencesStore((state) => state.zip);
  const storesQuery = useNearbyStores(zip);
  const activeStores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const activeStoreIds = useMemo(() => activeStores.map((store) => store.id), [activeStores]);
  const storeById = useMemo(
    () => new Map(activeStores.map((store) => [store.id, store])),
    [activeStores],
  );
  const productQuery = useProductPrices(productId ?? '', activeStoreIds);
  const cartQuery = useCurrentCart();
  const updateCartItem = useUpdateCartItem();
  const reducedMotion = useReducedMotion();

  const cartItem = useMemo(
    () => cartQuery.data?.cart.items.find((item) => item.productId === productId),
    [cartQuery.data?.cart.items, productId],
  );
  const sortedPrices = useMemo(
    () =>
      [...(productQuery.data?.prices ?? [])].sort(
        (first, second) => effectivePrice(first) - effectivePrice(second),
      ),
    [productQuery.data?.prices],
  );

  const product = productQuery.data?.product;
  const size = product ? formatProductSize(product.sizeQty, product.sizeUnit) : null;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
          <BackControl />

          {productQuery.isLoading ? (
            <ProductDetailLoadingState />
          ) : !product ? (
            <EmptyState
              icon={SEARCH_ICON}
              title="Item unavailable"
              message="Try another item or change your location."
            />
          ) : (
            <>
              <Animated.View entering={entrance(0, reducedMotion)}>
                <Card style={styles.imageCard}>
                  <ProductImage imageUrl={product.imageUrl} name={product.name} />
                </Card>
              </Animated.View>

              <Animated.View entering={entrance(1, reducedMotion)} style={styles.productDetails}>
                <View style={styles.productCopy}>
                  <ThemedText type="title" numberOfLines={3}>
                    {product.name}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2}>
                    {[product.brand, size, product.category].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                {cartItem ? (
                  <CartQuantityStepper
                    qty={cartItem.qty}
                    disabled={updateCartItem.isPending}
                    onChange={(qty) => updateCartItem.mutate({ productId: product.id, qty })}
                  />
                ) : (
                  <AppButton
                    label="Add to cart"
                    disabled={updateCartItem.isPending}
                    loading={updateCartItem.isPending}
                    onPress={() => updateCartItem.mutate({ productId: product.id, qty: 1 })}
                    style={styles.addButton}
                  />
                )}
              </Animated.View>

              <Animated.View entering={entrance(2, reducedMotion)}>
                <SourceStatusBanner sources={productQuery.data?.sources} stores={activeStores} />
              </Animated.View>

              <Animated.View entering={entrance(3, reducedMotion)} style={styles.priceSection}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="eyebrow">STORE PRICES</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {sortedPrices.length} stores
                  </ThemedText>
                </View>
                {sortedPrices.length > 0 ? (
                  <Card flush style={styles.priceCard}>
                    {sortedPrices.map((price, index) => {
                      const store = storeById.get(price.storeId);
                      return (
                        <ReceiptRow
                          key={price.storeId}
                          title={store?.name ?? price.storeId}
                          meta={formatStoreMeta(store)}
                          value={effectivePrice(price)}
                          wasValue={price.promoPrice === null ? null : price.price}
                          capturedAt={price.capturedAt}
                          highlight={index === 0}
                        />
                      );
                    })}
                  </Card>
                ) : (
                  <Card>
                    <ThemedText type="small" themeColor="textSecondary">
                      No nearby store prices are available for this item.
                    </ThemedText>
                  </Card>
                )}
              </Animated.View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function BackControl() {
  const theme = useTheme();

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={() => router.back()}
      style={styles.backControl}>
      <View style={[styles.backCircle, { backgroundColor: theme.backgroundSelected }]}>
        <SymbolView name={BACK_ICON} tintColor={theme.accent} size={18} />
      </View>
      <ThemedText type="smallBold" themeColor="accent">
        Back
      </ThemedText>
    </PressableScale>
  );
}

function ProductImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  return imageUrl ? (
    <Image
      source={imageUrl}
      contentFit="contain"
      accessibilityLabel={name}
      style={styles.productImage}
    />
  ) : (
    <View style={styles.productFallback}>
      <ThemedText type="display" themeColor="accent">
        {name.slice(0, 1)}
      </ThemedText>
    </View>
  );
}

function ProductDetailLoadingState() {
  return (
    <View style={styles.loadingStack}>
      <Skeleton height={200} radius={Radii.card} />
      <Skeleton height={44} width={132} radius={Radii.control} />
    </View>
  );
}

function effectivePrice(price: { price: number; promoPrice: number | null }) {
  return price.promoPrice ?? price.price;
}

function formatStoreMeta(store: Store | undefined) {
  if (!store) {
    return 'Nearby store';
  }
  const distance = store.distanceMiles === undefined ? null : `${store.distanceMiles.toFixed(1)} mi`;
  return [chainLabel(store.chain), distance].filter(Boolean).join(' · ');
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
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  backControl: {
    minHeight: 36,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: Radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageCard: { height: 200, padding: Spacing.three },
  productImage: { width: '100%', height: '100%' },
  productFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  productDetails: { gap: Spacing.three },
  productCopy: { gap: Spacing.one },
  addButton: { alignSelf: 'flex-start', minWidth: 132 },
  priceSection: { gap: Spacing.two },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  priceCard: { padding: Spacing.two },
  loadingStack: { gap: Spacing.three },
});
