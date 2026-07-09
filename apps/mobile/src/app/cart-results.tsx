import type { CartBillLine, CartOptimization, Store, StoreCartTotal } from '@cartwise/shared';
import { useQueryClient } from '@tanstack/react-query';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CartItem } from '@/api/client';
import { cartOptimizationQueryKey, useCurrentCart, useNearbyStores } from '@/api/queries';
import { SourceStatusBanner } from '@/components/source-status-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FreshnessStamp } from '@/components/ui/freshness-stamp';
import { PriceText } from '@/components/ui/price-text';
import { ProductThumb } from '@/components/ui/product-thumb';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
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

const CHEVRON_ICON = {
  ios: 'chevron.right',
  android: 'chevron_right',
  web: 'chevron_right',
} satisfies SymbolViewProps['name'];

const BACK_ICON = {
  ios: 'chevron.left',
  android: 'chevron_left',
  web: 'chevron_left',
} satisfies SymbolViewProps['name'];

export default function CartResultsScreen() {
  const queryClient = useQueryClient();
  const optimization = queryClient.getQueryData<CartOptimization>(cartOptimizationQueryKey);
  const zip = usePreferencesStore((state) => state.zip);
  const cartQuery = useCurrentCart();
  const storesQuery = useNearbyStores(zip);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

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
    () => rankStoreTotals(optimization, storeById),
    [optimization, storeById],
  );
  const selectedStoreTotal =
    selectedStoreId === null
      ? null
      : rankedStoreTotals.find((storeTotal) => storeTotal.storeId === selectedStoreId) ?? null;

  if (!optimization) {
    return (
      <ScreenShell>
        <TopBar label="Cart" onBack={() => router.replace('/cart')} />
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
        <TopBar label="Cart" onBack={() => router.replace('/cart')} />
        <EmptyState
          icon={WARNING_ICON}
          title="Could not load results"
          message="The cart finished, but store or item details are unavailable."
          action={{ label: 'Back to cart', onPress: () => router.replace('/cart') }}
        />
      </ScreenShell>
    );
  }

  if (selectedStoreTotal) {
    return (
      <StoreBillDetail
        productById={productById}
        store={storeById.get(selectedStoreTotal.storeId)}
        storeTotal={selectedStoreTotal}
        onBack={() => setSelectedStoreId(null)}
      />
    );
  }

  return (
    <ScreenShell>
      <TopBar label="Cart" onBack={() => router.back()} />

      <View style={styles.header}>
        <ThemedText type="eyebrow" themeColor="accent">
          CARTWISE
        </ThemedText>
        <ThemedText type="display">Store totals</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {rankedStoreTotals.length} ranked {rankedStoreTotals.length === 1 ? 'store' : 'stores'} near{' '}
          {zip}
        </ThemedText>
      </View>

      <SourceStatusBanner sources={storesQuery.data?.sources} stores={stores} />

      {cartQuery.isLoading || storesQuery.isLoading ? (
        <ResultsSkeleton />
      ) : (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="eyebrow">RANKED STORES</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              Sorted by total bill
            </ThemedText>
          </View>
          <View style={styles.storeCardStack}>
            {rankedStoreTotals.map((storeTotal, index) => (
              <StoreTotalCard
                key={storeTotal.storeId}
                isCheapest={index === 0}
                store={storeById.get(storeTotal.storeId)}
                storeTotal={storeTotal}
                worstTotal={optimization.worstTotal}
                onPress={() => setSelectedStoreId(storeTotal.storeId)}
              />
            ))}
          </View>
        </View>
      )}
    </ScreenShell>
  );
}

function StoreBillDetail({
  productById,
  store,
  storeTotal,
  onBack,
}: {
  productById: ReadonlyMap<string, CartItem['product']>;
  store?: Store;
  storeTotal: StoreCartTotal;
  onBack: () => void;
}) {
  return (
    <ScreenShell>
      <TopBar label="Store totals" onBack={onBack} />

      <View style={styles.header}>
        <ThemedText type="eyebrow" themeColor="accent">
          ITEMIZED BILL
        </ThemedText>
        <ThemedText type="display" numberOfLines={2}>
          {store?.name ?? storeTotal.storeId}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatStoreMeta(store)}
        </ThemedText>
      </View>

      <Card style={styles.billSummaryCard}>
        <View style={styles.billSummaryCopy}>
          <ThemedText type="eyebrow" themeColor="accent">
            TOTAL BILL
          </ThemedText>
          <PriceText value={storeTotal.total} size="hero" color="accent" />
        </View>
        <View style={styles.billSummaryMeta}>
          <Chip label={formatCoverage(storeTotal)} tone="neutral" />
          {storeTotal.substitutionCount > 0 ? (
            <Chip label={formatSubstitutions(storeTotal.substitutionCount)} tone="deal" />
          ) : null}
          <FreshnessStamp capturedAt={storeTotal.pricesAsOf} />
        </View>
      </Card>

      <View style={styles.section}>
        <ThemedText type="eyebrow">ITEMS</ThemedText>
        <Card flush>
          {storeTotal.lines.length > 0 ? (
            storeTotal.lines.map((line, index) => (
              <BillLineRow
                key={`${line.productId}-${line.substitutedProductId ?? 'exact'}`}
                line={line}
                product={productById.get(line.productId)}
                showSeparator={index < storeTotal.lines.length - 1}
              />
            ))
          ) : (
            <View style={styles.emptyCardRow}>
              <ThemedText type="small" themeColor="textSecondary">
                No priced items were found for this store.
              </ThemedText>
            </View>
          )}
        </Card>
      </View>

      {storeTotal.missingItems.length > 0 ? (
        <View style={styles.section}>
          <ThemedText type="eyebrow">MISSING ITEMS</ThemedText>
          <Card flush>
            {storeTotal.missingItems.map((productId, index) => {
              const product = productById.get(productId);

              return (
                <View
                  key={productId}
                  style={[
                    styles.missingRow,
                    index < storeTotal.missingItems.length - 1 && styles.rowSeparator,
                  ]}>
                  <ProductThumb imageUrl={product?.imageUrl ?? null} name={product?.name ?? productId} size={40} />
                  <View style={styles.missingCopy}>
                    <ThemedText type="smallBold" numberOfLines={2}>
                      {product?.name ?? formatProductId(productId)}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary">
                      Not found at this store
                    </ThemedText>
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}
    </ScreenShell>
  );
}

function StoreTotalCard({
  isCheapest,
  store,
  storeTotal,
  worstTotal,
  onPress,
}: {
  isCheapest: boolean;
  store?: Store;
  storeTotal: StoreCartTotal;
  worstTotal: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const savings = Math.max(0, worstTotal - storeTotal.total);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open bill for ${store?.name ?? storeTotal.storeId}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <Card
        style={[
          styles.storeCard,
          isCheapest && {
            backgroundColor: theme.accentMuted,
            borderColor: theme.accent,
          },
        ]}>
        <View style={styles.storeCardHeader}>
          <View style={styles.storeTitleBlock}>
            <View style={styles.storeTitleRow}>
              <ThemedText type="heading" numberOfLines={1} style={styles.storeTitle}>
                {store?.name ?? storeTotal.storeId}
              </ThemedText>
              {isCheapest ? <Chip label="Cheapest total" tone="accent" /> : null}
            </View>
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {formatStoreMeta(store)}
            </ThemedText>
          </View>
          <SymbolView name={CHEVRON_ICON} tintColor={theme.textSecondary} size={16} />
        </View>

        <View style={styles.totalRow}>
          <View style={styles.totalCopy}>
            <ThemedText type="eyebrow" themeColor="accent">
              TOTAL BILL
            </ThemedText>
            <PriceText value={storeTotal.total} size="lg" color={isCheapest ? 'accent' : 'text'} />
          </View>
          <View style={styles.totalMeta}>
            {savings > 0 ? (
              <Chip label={`Saves ${formatPrice(savings)}`} tone="deal" />
            ) : null}
            <FreshnessStamp capturedAt={storeTotal.pricesAsOf} />
          </View>
        </View>

        <View style={styles.cardChipRow}>
          <Chip label={formatCoverage(storeTotal)} tone="neutral" />
          {storeTotal.substitutionCount > 0 ? (
            <Chip label={formatSubstitutions(storeTotal.substitutionCount)} tone="deal" />
          ) : (
            <Chip label="No swaps" tone="neutral" />
          )}
          {storeTotal.missingItems.length > 0 ? (
            <Chip label={formatMissingItems(storeTotal.missingItems.length)} tone="danger" />
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

function BillLineRow({
  line,
  product,
  showSeparator,
}: {
  line: CartBillLine;
  product?: CartItem['product'];
  showSeparator: boolean;
}) {
  const theme = useTheme();
  const productName = product?.name ?? formatProductId(line.productId);
  const size = product ? formatProductSize(product.sizeQty, product.sizeUnit) : null;
  const meta = [product?.brand, size, `Qty ${line.qty} x ${formatPrice(line.unitPrice)}`]
    .filter(Boolean)
    .join(' · ');
  const swapName = line.substitutedProductName ?? (
    line.substitutedProductId ? formatProductId(line.substitutedProductId) : null
  );

  return (
    <View
      style={[
        styles.billLineRow,
        showSeparator && styles.rowSeparator,
        showSeparator && { borderBottomColor: theme.border },
      ]}>
      <ProductThumb imageUrl={product?.imageUrl ?? null} name={productName} size={44} />
      <View style={styles.billLineCopy}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {productName}
        </ThemedText>
        {swapName ? (
          <ThemedText type="caption" themeColor="deal" numberOfLines={2}>
            swap: {swapName}
          </ThemedText>
        ) : null}
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {meta}
        </ThemedText>
      </View>
      <View style={styles.linePriceBlock}>
        <PriceText value={line.lineTotal} size="sm" color="text" />
        <FreshnessStamp capturedAt={line.capturedAt} style={styles.lineFreshness} />
      </View>
    </View>
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

function TopBar({ label, onBack }: { label: string; onBack: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        tapLight();
        onBack();
      }}
      style={({ pressed }) => [
        styles.backControl,
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <SymbolView name={BACK_ICON} tintColor={theme.accent} size={16} />
      <ThemedText type="smallBold" themeColor="accent">
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ResultsSkeleton() {
  return (
    <View style={styles.storeCardStack}>
      {[0, 1, 2].map((row) => (
        <Card key={row} style={styles.skeletonCard}>
          <Skeleton height={18} width="58%" />
          <Skeleton height={14} width="38%" />
          <Skeleton height={40} width={104} radius={Radii.control} />
          <Skeleton height={20} width="74%" />
        </Card>
      ))}
    </View>
  );
}

function rankStoreTotals(
  optimization: CartOptimization | undefined,
  storeById: ReadonlyMap<string, Store>,
) {
  if (!optimization) {
    return [];
  }

  return [...optimization.perStoreTotals].sort((first, second) => {
    const firstStore = storeById.get(first.storeId);
    const secondStore = storeById.get(second.storeId);

    return (
      first.total - second.total ||
      first.missingItems.length - second.missingItems.length ||
      (firstStore?.name ?? first.storeId).localeCompare(secondStore?.name ?? second.storeId)
    );
  });
}

function formatStoreMeta(store: Store | undefined) {
  if (!store) {
    return 'Nearby store';
  }

  return [chainLabel(store.chain), formatDistance(store.distanceMiles)].filter(Boolean).join(' · ');
}

function formatDistance(distanceMiles: number | undefined) {
  return distanceMiles === undefined ? null : `${distanceMiles.toFixed(1)} mi`;
}

function formatCoverage(storeTotal: StoreCartTotal) {
  return `${storeTotal.coveredItemCount} of ${storeTotal.itemCount} items`;
}

function formatSubstitutions(count: number) {
  return `${count} ${count === 1 ? 'swap' : 'swaps'}`;
}

function formatMissingItems(count: number) {
  return `${count} ${count === 1 ? 'missing item' : 'missing items'}`;
}

function formatProductId(productId: string) {
  return productId
    .split('-')
    .filter((part) => part.length > 0)
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
  header: {
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  storeCardStack: {
    gap: Spacing.two,
  },
  storeCard: {
    gap: Spacing.three,
  },
  storeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  storeTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  storeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  storeTitle: {
    flexShrink: 1,
    minWidth: 0,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  totalCopy: {
    gap: Spacing.half,
  },
  totalMeta: {
    alignItems: 'flex-end',
    gap: Spacing.one,
    flexShrink: 1,
  },
  cardChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  billSummaryCard: {
    gap: Spacing.three,
  },
  billSummaryCopy: {
    gap: Spacing.one,
  },
  billSummaryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  billLineRow: {
    minHeight: 88,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  billLineCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  linePriceBlock: {
    alignItems: 'flex-end',
    gap: Spacing.one,
    maxWidth: 112,
  },
  lineFreshness: {
    maxWidth: 112,
  },
  missingRow: {
    minHeight: 68,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  missingCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  rowSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyCardRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  skeletonCard: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
});
