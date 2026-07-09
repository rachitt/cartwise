import type { CartBillLine, CartOptimization, Store, StoreCartTotal } from '@cartwise/shared';
import { useQueryClient } from '@tanstack/react-query';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { CartItem } from '@/api/client';
import { cartOptimizationQueryKey, useCurrentCart, useNearbyStores } from '@/api/queries';
import { SourceStatusBanner } from '@/components/source-status-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AnimatedPriceText } from '@/components/ui/animated-price-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FreshnessStamp } from '@/components/ui/freshness-stamp';
import { PressableScale } from '@/components/ui/pressable-scale';
import { PriceText } from '@/components/ui/price-text';
import { ProductThumb } from '@/components/ui/product-thumb';
import { SavingsTag } from '@/components/ui/savings-tag';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Motion, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tapSuccess } from '@/lib/haptics';
import { entrance } from '@/lib/motion';
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
  const [hasShownRankedView, setHasShownRankedView] = useState(false);
  const [hasRevealedSavings, setHasRevealedSavings] = useState(false);

  const stores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const cartItems = useMemo(() => cartQuery.data?.cart.items ?? [], [cartQuery.data?.cart.items]);
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

  const markRankedViewShown = useCallback(() => setHasShownRankedView(true), []);
  const markSavingsRevealed = useCallback(() => setHasRevealedSavings(true), []);

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

  const winner = rankedStoreTotals[0];
  const priciest = rankedStoreTotals[rankedStoreTotals.length - 1];
  const animateRankedView = !hasShownRankedView;

  return (
    <ScreenShell>
      <TopBar label="Cart" onBack={() => router.back()} />
      <ThemedText type="eyebrow" themeColor="accent">
        YOUR CHEAPEST STORE
      </ThemedText>

      {cartQuery.isLoading || storesQuery.isLoading ? (
        <ResultsSkeleton />
      ) : winner ? (
        <>
          <HeroBillCard
            animateEntrance={animateRankedView}
            revealPlayed={hasRevealedSavings}
            onEntranceShown={markRankedViewShown}
            onReveal={markSavingsRevealed}
            priciestStoreName={
              storeById.get(priciest.storeId)?.name ?? priciest.storeId
            }
            savings={Math.max(0, optimization.worstTotal - winner.total)}
            store={storeById.get(winner.storeId)}
            storeTotal={winner}
            onPress={() => setSelectedStoreId(winner.storeId)}
          />

          <SourceStatusBanner sources={storesQuery.data?.sources} stores={stores} />

          {rankedStoreTotals.length > 1 ? (
            <OtherStoresSection
              animateEntrance={animateRankedView}
              storeById={storeById}
              stores={rankedStoreTotals.slice(1)}
              winner={winner}
              onSelectStore={setSelectedStoreId}
            />
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={RESULTS_EMPTY_ICON}
          title="No ranked stores"
          message="No store totals were returned for this cart."
        />
      )}
    </ScreenShell>
  );
}

function HeroBillCard({
  animateEntrance,
  priciestStoreName,
  revealPlayed,
  savings,
  store,
  storeTotal,
  onEntranceShown,
  onPress,
  onReveal,
}: {
  animateEntrance: boolean;
  priciestStoreName: string;
  revealPlayed: boolean;
  savings: number;
  store?: Store;
  storeTotal: StoreCartTotal;
  onEntranceShown: () => void;
  onPress: () => void;
  onReveal: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(reducedMotion || !animateEntrance ? 1 : 0.96);
  const shouldShowSavings = (reducedMotion || revealPlayed) && savings > 0;

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    if (animateEntrance) {
      scale.set(withSpring(1, Motion.springGentle));
    }
    if (savings <= 0 || revealPlayed) {
      return;
    }

    const timeout = setTimeout(() => {
      onReveal();
      tapSuccess();
    }, 350);

    return () => clearTimeout(timeout);
  }, [animateEntrance, onReveal, reducedMotion, revealPlayed, savings, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <Animated.View
      entering={
        animateEntrance ? (reducedMotion ? FadeIn : FadeInUp).duration(Motion.base) : undefined
      }
      onLayout={onEntranceShown}
      style={animatedStyle}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Open bill for ${store?.name ?? storeTotal.storeId}`}
        onPress={onPress}>
        <Card surface="hero" style={styles.heroCard}>
          <ThemedText type="displayXL" themeColor="onHero" numberOfLines={2}>
            {store?.name ?? storeTotal.storeId}
          </ThemedText>
          <ThemedText type="small" themeColor="onHeroMuted">
            {formatStoreMeta(store)}
          </ThemedText>

          <View style={styles.heroTotal}>
            <ThemedText type="eyebrow" themeColor="onHeroMuted">
              TOTAL BILL
            </ThemedText>
            <AnimatedPriceText value={storeTotal.total} size="hero" color="dealTag" />
          </View>

          {shouldShowSavings ? (
            <SavingsTag
              stamp={!reducedMotion}
              holeColor="heroSurface"
              label={`Saves ${formatPrice(savings)} vs ${priciestStoreName}`}
            />
          ) : null}

          <View style={styles.heroChipRow}>
            <Chip label={formatCoverage(storeTotal)} tone="hero" />
            {storeTotal.substitutionCount > 0 ? (
              <Chip label={formatSubstitutions(storeTotal.substitutionCount)} tone="hero" />
            ) : null}
            {storeTotal.missingItems.length > 0 ? (
              <Chip label={formatMissingItems(storeTotal.missingItems.length)} tone="hero" />
            ) : null}
          </View>
          <FreshnessStamp inverse capturedAt={storeTotal.pricesAsOf} />
        </Card>
      </PressableScale>
    </Animated.View>
  );
}

function OtherStoresSection({
  animateEntrance,
  storeById,
  stores,
  winner,
  onSelectStore,
}: {
  animateEntrance: boolean;
  storeById: ReadonlyMap<string, Store>;
  stores: StoreCartTotal[];
  winner: StoreCartTotal;
  onSelectStore: (storeId: string) => void;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <Animated.View
      entering={animateEntrance ? entrance(0, reducedMotion) : undefined}
      style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="eyebrow">OTHER STORES</ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          Sorted by total bill
        </ThemedText>
      </View>
      <View style={styles.storeCardStack}>
        {stores.map((storeTotal, index) => (
          <Animated.View
            key={storeTotal.storeId}
            entering={animateEntrance ? entrance(index + 1, reducedMotion) : undefined}>
            <OtherStoreCard
              rank={index + 2}
              store={storeById.get(storeTotal.storeId)}
              storeTotal={storeTotal}
              winnerTotal={winner.total}
              onPress={() => onSelectStore(storeTotal.storeId)}
            />
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

function OtherStoreCard({
  rank,
  store,
  storeTotal,
  winnerTotal,
  onPress,
}: {
  rank: number;
  store?: Store;
  storeTotal: StoreCartTotal;
  winnerTotal: number;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open bill for ${store?.name ?? storeTotal.storeId}`}
      onPress={onPress}>
      <Card style={styles.otherStoreCard}>
        <View style={styles.otherStoreTop}>
          <View style={[styles.rankCircle, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {rank}
            </ThemedText>
          </View>
          <View style={styles.storeCopy}>
            <ThemedText type="heading" numberOfLines={1}>
              {store?.name ?? storeTotal.storeId}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {formatStoreMeta(store)}
            </ThemedText>
          </View>
          <View style={styles.otherStorePrice}>
            <PriceText value={storeTotal.total} size="lg" />
            <ThemedText type="caption" themeColor="textSecondary">
              +{formatPrice(storeTotal.total - winnerTotal)} vs cheapest
            </ThemedText>
          </View>
        </View>
        <View style={styles.cardChipRow}>
          <Chip label={formatCoverage(storeTotal)} tone="neutral" />
          {storeTotal.substitutionCount > 0 ? (
            <Chip label={formatSubstitutions(storeTotal.substitutionCount)} tone="deal" />
          ) : null}
          {storeTotal.missingItems.length > 0 ? (
            <Chip label={formatMissingItems(storeTotal.missingItems.length)} tone="danger" />
          ) : null}
        </View>
        <FreshnessStamp capturedAt={storeTotal.pricesAsOf} />
      </Card>
    </PressableScale>
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
  const reducedMotion = useReducedMotion();
  const theme = useTheme();

  return (
    <ScreenShell>
      <TopBar label="Store totals" onBack={onBack} />

      <Animated.View entering={entrance(0, reducedMotion)} style={styles.header}>
        <ThemedText type="eyebrow" themeColor="accent">
          ITEMIZED BILL
        </ThemedText>
        <ThemedText type="display" numberOfLines={2}>
          {store?.name ?? storeTotal.storeId}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatStoreMeta(store)}
        </ThemedText>
      </Animated.View>

      <Animated.View entering={entrance(1, reducedMotion)}>
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
      </Animated.View>

      <Animated.View entering={entrance(2, reducedMotion)} style={styles.section}>
        <ThemedText type="eyebrow">ITEMS</ThemedText>
        <Card flush>
          {storeTotal.lines.length > 0 ? (
            storeTotal.lines.map((line) => (
              <BillLineRow
                key={`${line.productId}-${line.substitutedProductId ?? 'exact'}`}
                line={line}
                product={productById.get(line.productId)}
              />
            ))
          ) : (
            <View style={styles.emptyCardRow}>
              <ThemedText type="small" themeColor="textSecondary">
                No priced items were found for this store.
              </ThemedText>
            </View>
          )}
          <View style={[styles.billTotalRow, { borderTopColor: theme.border }]}>
            <ThemedText type="smallBold">TOTAL</ThemedText>
            <PriceText value={storeTotal.total} size="md" />
          </View>
        </Card>
      </Animated.View>

      {storeTotal.missingItems.length > 0 ? (
        <Animated.View entering={entrance(3, reducedMotion)} style={styles.section}>
          <ThemedText type="eyebrow">MISSING ITEMS</ThemedText>
          <Card flush>
            {storeTotal.missingItems.map((productId, index) => {
              const product = productById.get(productId);

              return (
                <View
                  key={productId}
                  style={[
                    styles.missingRow,
                    index > 0 && styles.solidTopSeparator,
                    index > 0 && { borderTopColor: theme.border },
                  ]}>
                  <ProductThumb
                    imageUrl={product?.imageUrl ?? null}
                    name={product?.name ?? productId}
                    size={40}
                  />
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
        </Animated.View>
      ) : null}
    </ScreenShell>
  );
}

function BillLineRow({
  line,
  product,
}: {
  line: CartBillLine;
  product?: CartItem['product'];
}) {
  const theme = useTheme();
  const productName = product?.name ?? formatProductId(line.productId);
  const size = product ? formatProductSize(product.sizeQty, product.sizeUnit) : null;
  const meta = [product?.brand, size, `Qty ${line.qty} x ${formatPrice(line.unitPrice)}`]
    .filter(Boolean)
    .join(' · ');
  const swapName =
    line.substitutedProductName ??
    (line.substitutedProductId ? formatProductId(line.substitutedProductId) : null);

  return (
    <View style={[styles.billLineRow, { borderBottomColor: theme.border }]}>
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
        <PriceText value={line.lineTotal} size="sm" />
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
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onBack}
      style={styles.backControl}>
      <View style={[styles.backCircle, { backgroundColor: theme.backgroundSelected }]}>
        <SymbolView name={BACK_ICON} tintColor={theme.accent} size={16} />
      </View>
      <ThemedText type="smallBold" themeColor="accent">
        {label}
      </ThemedText>
    </PressableScale>
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
  header: { gap: Spacing.one },
  heroCard: { gap: Spacing.two },
  heroTotal: { gap: Spacing.half, paddingTop: Spacing.two },
  heroChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  section: { gap: Spacing.two },
  sectionHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  storeCardStack: { gap: Spacing.two },
  otherStoreCard: { gap: Spacing.three },
  otherStoreTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: Radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeCopy: { flex: 1, minWidth: 0, gap: Spacing.half },
  otherStorePrice: { alignItems: 'flex-end', gap: Spacing.half },
  cardChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  billSummaryCard: { gap: Spacing.three },
  billSummaryCopy: { gap: Spacing.one },
  billSummaryMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  billLineRow: {
    minHeight: 88,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  billLineCopy: { flex: 1, minWidth: 0, gap: Spacing.half },
  linePriceBlock: { alignItems: 'flex-end', gap: Spacing.one, maxWidth: 112 },
  lineFreshness: { maxWidth: 112 },
  billTotalRow: {
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  missingRow: {
    minHeight: 68,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  missingCopy: { flex: 1, minWidth: 0, gap: Spacing.one },
  solidTopSeparator: { borderTopWidth: StyleSheet.hairlineWidth },
  emptyCardRow: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  skeletonCard: { gap: Spacing.two },
});
