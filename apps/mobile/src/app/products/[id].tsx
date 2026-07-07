import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatProductSize } from '@/lib/price';
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
  const storesQuery = useNearbyStores(zip);
  const activeStores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const activeStoreIds = useMemo(() => activeStores.map((store) => store.id), [activeStores]);
  const productQuery = useProductPrices(productId ?? '', activeStoreIds);
  const cartQuery = useCurrentCart();
  const updateCartItem = useUpdateCartItem();

  const cartItem = useMemo(
    () => cartQuery.data?.cart.items.find((item) => item.productId === productId),
    [cartQuery.data?.cart.items, productId],
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
              icon={searchIcon}
              title="Item unavailable"
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
                    {[product.brand, size, product.category].filter(Boolean).join(' · ')}
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

              <SourceStatusBanner sources={productQuery.data?.sources} stores={activeStores} />
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
      <Skeleton height={44} width={132} radius={Radii.control} />
    </View>
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
  loadingStack: {
    gap: Spacing.three,
  },
});
