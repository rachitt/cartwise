import type { Product, Store, StorePrice } from '@cartwise/shared';
import type { SearchResult } from '@/api/client';
import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { CartQuantityStepper } from '@/components/cart-quantity-stepper';
import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PriceText } from '@/components/ui/price-text';
import { ReceiptRow } from '@/components/ui/receipt-row';
import { Motion, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chainLabel, effectivePrice, formatPrice, formatProductSize } from '@/lib/price';

const OTHER_BRANDS = 'Other brands';
const CHEVRON_ICON = {
  ios: 'chevron.right',
  android: 'chevron_right',
  web: 'chevron_right',
} satisfies SymbolViewProps['name'];

type BrandFirstSearchResultsProps = {
  activeStores: Store[];
  disabled: boolean;
  qtyByProductId: ReadonlyMap<string, number>;
  results: SearchResult[];
  selectedBrand: string | null;
  onBackToBrands: () => void;
  onChangeQty: (productId: string, qty: number) => void;
  onSelectBrand: (brand: string) => void;
};

type BrandGroup = {
  name: string;
  products: SearchResult[];
  productCount: number;
  lowestPrice: number;
  maxSavings: number;
  storeCount: number;
  thumbnailProduct: Product;
  isOther: boolean;
};

type StorePriceRow = {
  store: Store;
  price: StorePrice;
};

export function BrandFirstSearchResults({
  activeStores,
  disabled,
  qtyByProductId,
  results,
  selectedBrand,
  onBackToBrands,
  onChangeQty,
  onSelectBrand,
}: BrandFirstSearchResultsProps) {
  const reducedMotion = useReducedMotion();
  const brandGroups = groupSearchResultsByBrand(results);
  const selectedGroup =
    selectedBrand === null
      ? null
      : brandGroups.find((group) => group.name === selectedBrand) ?? null;
  const layoutTransition = reducedMotion
    ? undefined
    : LinearTransition.springify()
        .damping(Motion.spring.damping)
        .stiffness(Motion.spring.stiffness);
  const entering = FadeIn.duration(reducedMotion ? Motion.fast : Motion.base);
  const exiting = FadeOut.duration(Motion.fast);

  if (selectedGroup === null) {
    return (
      <Animated.View
        key="brand-list"
        entering={entering}
        exiting={exiting}
        layout={layoutTransition}
        style={styles.stage}>
        <BrandList brandGroups={brandGroups} onSelectBrand={onSelectBrand} />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      key={`brand-${selectedGroup.name}`}
      entering={entering}
      exiting={exiting}
      layout={layoutTransition}
      style={styles.stage}>
      <BrandDetail
        activeStores={activeStores}
        brandGroup={selectedGroup}
        disabled={disabled}
        qtyByProductId={qtyByProductId}
        onBackToBrands={onBackToBrands}
        onChangeQty={onChangeQty}
      />
    </Animated.View>
  );
}

function BrandList({
  brandGroups,
  onSelectBrand,
}: {
  brandGroups: BrandGroup[];
  onSelectBrand: (brand: string) => void;
}) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <ThemedText type="eyebrow" themeColor="accent">
          BRANDS
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {brandGroups.length} brands
        </ThemedText>
      </View>
      <Card flush style={styles.brandCard}>
        {brandGroups.map((brand, index) => (
          <BrandRow
            key={brand.name}
            brand={brand}
            isLast={index === brandGroups.length - 1}
            onPress={() => onSelectBrand(brand.name)}
          />
        ))}
      </Card>
    </>
  );
}

function BrandRow({
  brand,
  isLast,
  onPress,
}: {
  brand: BrandGroup;
  isLast: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.brandRowShell,
        { borderBottomColor: theme.border },
        isLast && styles.lastRow,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show ${brand.name} products`}
        onPress={onPress}
        style={({ pressed }) => [styles.brandRow, pressed && styles.pressed]}>
        <ProductThumb product={brand.thumbnailProduct} />
        <View style={styles.brandCopy}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {brand.name}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {brand.productCount} {brand.productCount === 1 ? 'product' : 'products'}
          </ThemedText>
          <View style={styles.brandMetaRow}>
            <View style={styles.priceLine}>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.fromText}>
                from
              </ThemedText>
              <PriceText value={brand.lowestPrice} size="sm" color="accent" />
            </View>
            {brand.storeCount >= 2 ? (
              <Chip label={`Saves ${formatPrice(brand.maxSavings)}`} tone="deal" />
            ) : null}
          </View>
        </View>
        <SymbolView name={CHEVRON_ICON} tintColor={theme.textSecondary} size={15} weight="semibold" />
      </Pressable>
    </View>
  );
}

function BrandDetail({
  activeStores,
  brandGroup,
  disabled,
  qtyByProductId,
  onBackToBrands,
  onChangeQty,
}: {
  activeStores: Store[];
  brandGroup: BrandGroup;
  disabled: boolean;
  qtyByProductId: ReadonlyMap<string, number>;
  onBackToBrands: () => void;
  onChangeQty: (productId: string, qty: number) => void;
}) {
  return (
    <>
      <View style={styles.detailHeader}>
        <AppButton
          haptic="light"
          label="‹ All brands"
          onPress={onBackToBrands}
          size="md"
          style={styles.backButton}
          variant="ghost"
        />
        <View style={styles.detailTitleBlock}>
          <ThemedText type="heading" numberOfLines={1}>
            {brandGroup.name}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {brandGroup.productCount} {brandGroup.productCount === 1 ? 'product' : 'products'}
          </ThemedText>
        </View>
      </View>
      <View style={styles.productList}>
        {brandGroup.products.map((result) => (
          <BrandProductCard
            key={result.product.id}
            activeStores={activeStores}
            disabled={disabled}
            qty={qtyByProductId.get(result.product.id) ?? 0}
            result={result}
            onChangeQty={(qty) => onChangeQty(result.product.id, qty)}
          />
        ))}
      </View>
    </>
  );
}

function BrandProductCard({
  activeStores,
  disabled,
  qty,
  result,
  onChangeQty,
}: {
  activeStores: Store[];
  disabled: boolean;
  qty: number;
  result: SearchResult;
  onChangeQty: (qty: number) => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const storePriceRows = getStorePriceRows(activeStores, result.prices);
  const cheapest = storePriceRows[0] ?? null;
  const cheapestValue = cheapest ? effectivePrice(cheapest.price) : null;
  const metaLabel = getProductMeta(result.product);

  return (
    <Animated.View
      entering={FadeIn.duration(reducedMotion ? Motion.fast : Motion.base)}
      layout={
        reducedMotion
          ? undefined
          : LinearTransition.springify()
              .damping(Motion.spring.damping)
              .stiffness(Motion.spring.stiffness)
      }>
      <Card style={styles.productCard}>
        <View style={styles.productHeader}>
          <ProductThumb product={result.product} />
          <View style={styles.productCopy}>
            <ThemedText type="smallBold" numberOfLines={2}>
              {result.product.name}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {metaLabel}
            </ThemedText>
          </View>
          <View style={styles.productAction}>
            <AddToCartControl
              disabled={disabled}
              productName={result.product.name}
              qty={qty}
              onChange={onChangeQty}
            />
          </View>
        </View>
        <View style={[styles.receiptList, { borderTopColor: theme.border }]}>
          {storePriceRows.map(({ store, price }, index) => {
            const value = effectivePrice(price);
            const delta = cheapestValue === null ? 0 : value - cheapestValue;

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
        </View>
      </Card>
    </Animated.View>
  );
}

function ProductThumb({ product }: { product: Product }) {
  const theme = useTheme();
  const fallback = product.name.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <View style={[styles.productThumb, { backgroundColor: theme.accentMuted }]}>
      {product.imageUrl ? (
        <Image source={product.imageUrl} contentFit="cover" style={styles.productImage} />
      ) : (
        <ThemedText type="smallBold" themeColor="accent">
          {fallback}
        </ThemedText>
      )}
    </View>
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

function groupSearchResultsByBrand(results: SearchResult[]) {
  const resultsByBrand = new Map<string, SearchResult[]>();

  results.forEach((result) => {
    if (result.prices.length === 0) {
      return;
    }

    const brandName = getBrandName(result.product.brand);
    const brandResults = resultsByBrand.get(brandName) ?? [];

    brandResults.push(result);
    resultsByBrand.set(brandName, brandResults);
  });

  return Array.from(resultsByBrand.entries())
    .map(([name, brandResults]) => {
      const products = [...brandResults].sort(compareSearchResults);
      const allPrices = products.flatMap((result) => result.prices);
      const storeIds = new Set(allPrices.map((price) => price.storeId));
      const thumbnailProduct =
        brandResults.find((result) => result.product.imageUrl !== null)?.product ??
        brandResults[0].product;

      return {
        name,
        products,
        productCount: products.length,
        lowestPrice: lowestEffectivePrice(allPrices),
        maxSavings: Math.max(0, ...products.map((result) => priceSpread(result.prices))),
        storeCount: storeIds.size,
        thumbnailProduct,
        isOther: name === OTHER_BRANDS,
      };
    })
    .sort(compareBrandGroups);
}

function getBrandName(brand: string | null) {
  const trimmed = brand?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : OTHER_BRANDS;
}

function compareBrandGroups(first: BrandGroup, second: BrandGroup) {
  if (first.isOther !== second.isOther) {
    return first.isOther ? 1 : -1;
  }

  return first.lowestPrice - second.lowestPrice || first.name.localeCompare(second.name);
}

function compareSearchResults(first: SearchResult, second: SearchResult) {
  return (
    lowestEffectivePrice(first.prices) - lowestEffectivePrice(second.prices) ||
    first.product.name.localeCompare(second.product.name)
  );
}

function getStorePriceRows(stores: Store[], prices: StorePrice[]): StorePriceRow[] {
  const storeById = new Map(stores.map((store) => [store.id, store]));

  return prices
    .map((price) => {
      const store = storeById.get(price.storeId);
      return store ? { store, price } : null;
    })
    .filter((row): row is StorePriceRow => row !== null)
    .sort((first, second) => effectivePrice(first.price) - effectivePrice(second.price));
}

function lowestEffectivePrice(prices: StorePrice[]) {
  return Math.min(...prices.map(effectivePrice));
}

function priceSpread(prices: StorePrice[]) {
  if (prices.length < 2) {
    return 0;
  }

  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;

  prices.forEach((price) => {
    const priceValue = effectivePrice(price);

    lowest = Math.min(lowest, priceValue);
    highest = Math.max(highest, priceValue);
  });

  return highest - lowest;
}

function getProductMeta(product: Product) {
  const size = formatProductSize(product.sizeQty, product.sizeUnit);

  return [size, product.category].filter(Boolean).join(' · ') || 'Details unavailable';
}

function formatStoreMeta(store: Store) {
  const distance =
    store.distanceMiles === undefined ? null : `${store.distanceMiles.toFixed(1)} mi`;

  return [chainLabel(store.chain), distance].filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  stage: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  brandCard: {
    width: '100%',
  },
  brandRowShell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  brandRow: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  brandMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.half,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  fromText: {
    paddingBottom: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  backButton: {
    paddingHorizontal: 0,
  },
  detailTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  productList: {
    gap: Spacing.two,
  },
  productCard: {
    gap: Spacing.three,
  },
  productHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  productCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  productAction: {
    flexShrink: 0,
    alignItems: 'flex-end',
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
  receiptList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  addButton: {
    minWidth: 64,
  },
  pressed: {
    opacity: 0.72,
  },
});
