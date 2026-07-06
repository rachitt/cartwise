import type { Store } from '@cartwise/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentCart, useProductPrices, useStores, useUpdateCartItem } from '@/api/queries';
import { CartQuantityStepper } from '@/components/cart-quantity-stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ReceiptRow } from '@/components/ui/receipt-row';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  chainLabel,
  effectivePrice,
  formatPrice,
  formatProductSize,
  formatUnitPriceLabel,
} from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';

const backIcon: SymbolViewProps['name'] = {
  ios: 'chevron.left',
  android: 'arrow_back',
  web: 'arrow_back',
};

const searchIcon: SymbolViewProps['name'] = {
  ios: 'magnifyingglass',
  android: 'search',
  web: 'search',
};

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Array.isArray(id) ? id[0] : id;
  const zip = usePreferencesStore((state) => state.zip);
  const storesQuery = useStores(zip);
  const activeStores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const activeStoreIds = useMemo(() => activeStores.map((store) => store.id), [activeStores]);
  const productQuery = useProductPrices(productId ?? '', activeStoreIds);
  const cartQuery = useCurrentCart();
  const updateCartItem = useUpdateCartItem();

  const storeById = useMemo(
    () => new Map(activeStores.map((store) => [store.id, store])),
    [activeStores],
  );
  const cartItem = useMemo(
    () => cartQuery.data?.cart.items.find((item) => item.productId === productId),
    [cartQuery.data?.cart.items, productId],
  );

  const prices = useMemo(
    () =>
      [...(productQuery.data?.prices ?? [])].sort(
        (first, second) => effectivePrice(first) - effectivePrice(second),
      ),
    [productQuery.data?.prices],
  );

  const product = productQuery.data?.product;
  const size = product ? formatProductSize(product.sizeQty, product.sizeUnit) : null;
  const cheapestPrice = prices[0] ? effectivePrice(prices[0]) : null;
  const cheapestUnitPrice =
    product && cheapestPrice !== null
      ? formatUnitPriceLabel(cheapestPrice, product.sizeQty, product.sizeUnit)
      : null;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
          <BackControl />

          {productQuery.isLoading ? (
            <ProductDetailLoadingState />
          ) : !product || prices.length === 0 || cheapestPrice === null ? (
            <EmptyState
              icon={searchIcon}
              title="No prices found nearby"
              message="Try another item or change your location."
            />
          ) : (
            <>
              <Card style={styles.productCard}>
                <ProductThumb imageUrl={product.imageUrl} name={product.name} />
                <View style={styles.productCopy}>
                  <ThemedText type="title" numberOfLines={3}>
                    {product.name}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2}>
                    {[
                      product.brand,
                      size,
                      product.category,
                      cheapestUnitPrice ? `best ${cheapestUnitPrice}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
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
                </View>
              </Card>

              <View style={styles.section}>
                <ThemedText type="eyebrow">STORE PRICES</ThemedText>
                <Card flush>
                  {prices.map((price, index) => {
                    const store = storeById.get(price.storeId);
                    const currentPrice = effectivePrice(price);
                    const delta = currentPrice - cheapestPrice;
                    const unitPriceLabel = formatUnitPriceLabel(
                      currentPrice,
                      product.sizeQty,
                      product.sizeUnit,
                    );

                    return (
                      <ReceiptRow
                        key={price.storeId}
                        title={store?.name ?? 'Selected store'}
                        meta={
                          store
                            ? formatStoreMeta(store, unitPriceLabel)
                            : [chainLabel(price.source), unitPriceLabel].filter(Boolean).join(' · ')
                        }
                        value={currentPrice}
                        wasValue={price.promoPrice !== null ? price.price : null}
                        capturedAt={price.capturedAt}
                        highlight={index === 0}
                        deltaLabel={delta > 0 ? `+${formatPrice(delta)}` : null}
                      />
                    );
                  })}
                </Card>
              </View>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={() => router.back()}
      style={({ pressed }) => [
        styles.backControl,
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <SymbolView name={backIcon} tintColor={theme.accent} size={18} />
      <ThemedText type="smallBold" themeColor="accent">
        Back
      </ThemedText>
    </Pressable>
  );
}

function ProductThumb({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.productThumb, { backgroundColor: theme.accentMuted }]}>
      {imageUrl ? (
        <Image
          source={imageUrl}
          contentFit="contain"
          accessibilityLabel={name}
          style={styles.productImage}
        />
      ) : (
        <ThemedText type="title" themeColor="accent">
          {name.slice(0, 1)}
        </ThemedText>
      )}
    </View>
  );
}

function ProductDetailLoadingState() {
  return (
    <View style={styles.loadingStack}>
      <Skeleton height={112} radius={Radii.card} />
      <View style={styles.section}>
        <ThemedText type="eyebrow">STORE PRICES</ThemedText>
        <Card flush>
          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.skeletonReceiptRow}>
              <Skeleton height={18} width="52%" />
              <Skeleton height={14} width="36%" />
              <Skeleton height={30} width="44%" />
            </View>
          ))}
        </Card>
      </View>
    </View>
  );
}

function formatDistance(distanceMiles: number | undefined) {
  return distanceMiles?.toFixed(1) ?? '--';
}

function formatStoreMeta(store: Store, unitPriceLabel: string | null) {
  return [chainLabel(store.chain), `${formatDistance(store.distanceMiles)} mi`, unitPriceLabel]
    .filter(Boolean)
    .join(' · ');
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radii.control,
    paddingHorizontal: Spacing.two,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  productThumb: {
    width: 72,
    height: 72,
    borderRadius: Radii.thumb,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productImage: {
    width: 72,
    height: 72,
    borderRadius: Radii.thumb,
  },
  productCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.two,
  },
  addButton: {
    alignSelf: 'flex-start',
    minWidth: 132,
  },
  section: {
    gap: Spacing.two,
  },
  loadingStack: {
    gap: Spacing.three,
  },
  skeletonReceiptRow: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
