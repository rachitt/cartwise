import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProductPrices, useStores } from '@/api/queries';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  chainLabel,
  effectivePrice,
  formatPrice,
  formatProductSize,
  formatRelativeTime,
} from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Array.isArray(id) ? id[0] : id;
  const zip = usePreferencesStore((state) => state.zip);
  const selectedStoreIds = usePreferencesStore((state) => state.selectedStoreIds);
  const storesQuery = useStores(zip);
  const productQuery = useProductPrices(productId ?? '', selectedStoreIds);

  const storeById = useMemo(
    () => new Map((storesQuery.data?.stores ?? []).map((store) => [store.id, store])),
    [storesQuery.data?.stores],
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

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>

          {productQuery.isLoading ? (
            <DetailSkeleton />
          ) : !product || prices.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText themeColor="textSecondary">No prices found nearby</ThemedText>
            </ThemedView>
          ) : (
            <>
              <View style={styles.productHeader}>
                <View style={styles.productImage}>
                  {product.imageUrl ? (
                    <Image source={product.imageUrl} style={styles.image} />
                  ) : (
                    <ThemedText type="subtitle" themeColor="accent">
                      {product.name.slice(0, 1)}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.productCopy}>
                  <ThemedText type="subtitle">{product.name}</ThemedText>
                  <ThemedText themeColor="textSecondary">
                    {[product.brand, size, product.category].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.priceList}>
                {prices.map((price) => {
                  const store = storeById.get(price.storeId);
                  const hasPromo = price.promoPrice !== null;

                  return (
                    <ThemedView key={price.storeId} type="backgroundElement" style={styles.priceRow}>
                      <View style={styles.storeCopy}>
                        <ThemedText type="smallBold">{store?.name ?? 'Selected store'}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {store
                            ? `${chainLabel(store.chain)} · ${store.distanceMiles?.toFixed(1) ?? '--'} mi`
                            : price.source}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          as of {formatRelativeTime(price.capturedAt)}
                        </ThemedText>
                      </View>
                      <View style={styles.priceCopy}>
                        {hasPromo ? (
                          <ThemedText type="small" themeColor="textSecondary" style={styles.struckPrice}>
                            {formatPrice(price.price)}
                          </ThemedText>
                        ) : null}
                        <ThemedText type="smallBold" themeColor={hasPromo ? 'accent' : 'text'}>
                          {formatPrice(effectivePrice(price))}
                        </ThemedText>
                      </View>
                    </ThemedView>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function DetailSkeleton() {
  return (
    <View style={styles.skeletonStack}>
      <ActivityIndicator color="#16a34a" />
      <ThemedView type="backgroundElement" style={styles.skeletonHero} />
      {[0, 1, 2].map((item) => (
        <ThemedView key={item} type="backgroundElement" style={styles.skeletonRow} />
      ))}
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
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  productHeader: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  productImage: {
    width: 92,
    height: 92,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcfce7',
  },
  image: {
    width: 92,
    height: 92,
    borderRadius: 8,
  },
  productCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  priceList: {
    gap: Spacing.three,
  },
  priceRow: {
    borderRadius: 8,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  storeCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  priceCopy: {
    alignItems: 'flex-end',
    minWidth: 74,
  },
  struckPrice: {
    textDecorationLine: 'line-through',
  },
  emptyState: {
    minHeight: 180,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  skeletonStack: {
    gap: Spacing.three,
  },
  skeletonHero: {
    height: 124,
    borderRadius: 8,
  },
  skeletonRow: {
    height: 94,
    borderRadius: 8,
  },
});
