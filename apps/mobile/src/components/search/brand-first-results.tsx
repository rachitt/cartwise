import type { Product } from '@cartwise/shared';
import type { SearchResult } from '@/api/client';
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
import { ProductThumb as UiProductThumb } from '@/components/ui/product-thumb';
import { Motion, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatProductSize } from '@/lib/price';

const OTHER_BRANDS = 'Other brands';
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

type BrandFirstSearchResultsProps = {
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
  thumbnailProduct: Product;
  isOther: boolean;
  firstResultIndex: number;
};

export function BrandFirstSearchResults({
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
  const displayName = formatDisplayName(brand.name);
  const productLabel = `${brand.productCount} ${brand.productCount === 1 ? 'product' : 'products'}`;

  return (
    <View
      style={[
        styles.brandRowShell,
        { borderBottomColor: theme.border },
        isLast && styles.lastRow,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show ${displayName} products`}
        onPress={onPress}
        style={({ pressed }) => [styles.brandRow, pressed && styles.pressed]}>
        <ProductThumb product={brand.thumbnailProduct} size={56} />
        <View style={styles.brandCopy}>
          <ThemedText type="bodyBold" numberOfLines={1}>
            {displayName}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {productLabel}
          </ThemedText>
        </View>
        <SymbolView name={CHEVRON_ICON} tintColor={theme.textSecondary} size={15} weight="semibold" />
      </Pressable>
    </View>
  );
}

function BrandDetail({
  brandGroup,
  disabled,
  qtyByProductId,
  onBackToBrands,
  onChangeQty,
}: {
  brandGroup: BrandGroup;
  disabled: boolean;
  qtyByProductId: ReadonlyMap<string, number>;
  onBackToBrands: () => void;
  onChangeQty: (productId: string, qty: number) => void;
}) {
  const theme = useTheme();

  return (
    <>
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to all brands"
          onPress={onBackToBrands}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: theme.backgroundSelected },
            pressed && styles.pressed,
          ]}>
          <SymbolView name={BACK_ICON} tintColor={theme.accent} size={15} weight="semibold" />
          <ThemedText type="smallBold" themeColor="accent">
            All brands
          </ThemedText>
        </Pressable>
        <View style={styles.detailTitleBlock}>
          <ThemedText type="heading" numberOfLines={1}>
            {formatDisplayName(brandGroup.name)}
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
  disabled,
  qty,
  result,
  onChangeQty,
}: {
  disabled: boolean;
  qty: number;
  result: SearchResult;
  onChangeQty: (qty: number) => void;
}) {
  const reducedMotion = useReducedMotion();
  const metaLabel = getProductMeta(result.product);
  const productMatchLabel = matchLabel(result);

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
          <ProductThumb product={result.product} size={56} />
          <View style={styles.productCopy}>
            <ThemedText type="smallBold" numberOfLines={2}>
              {result.product.name}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {metaLabel}
            </ThemedText>
            {productMatchLabel ? (
              <Chip label={productMatchLabel} tone="neutral" style={styles.matchChip} />
            ) : null}
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
      </Card>
    </Animated.View>
  );
}

function ProductThumb({ product, size }: { product: Product; size: number }) {
  return <UiProductThumb imageUrl={product.imageUrl} name={product.name} size={size} />;
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
  const firstIndexByBrand = new Map<string, number>();

  results.forEach((result, index) => {
    if (result.prices.length === 0) {
      return;
    }

    const brandName = getBrandName(result.product.brand);
    const brandResults = resultsByBrand.get(brandName) ?? [];

    brandResults.push(result);
    resultsByBrand.set(brandName, brandResults);
    if (!firstIndexByBrand.has(brandName)) {
      firstIndexByBrand.set(brandName, index);
    }
  });

  return Array.from(resultsByBrand.entries())
    .map(([name, brandResults]) => {
      const products = [...brandResults];
      const thumbnailProduct =
        brandResults.find((result) => result.product.imageUrl !== null)?.product ??
        brandResults[0].product;

      return {
        name,
        products,
        productCount: products.length,
        thumbnailProduct,
        isOther: name === OTHER_BRANDS,
        firstResultIndex: firstIndexByBrand.get(name) ?? Number.POSITIVE_INFINITY,
      };
    })
    .sort(compareBrandGroups);
}

function getBrandName(brand: string | null) {
  const trimmed = brand?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : OTHER_BRANDS;
}

function formatDisplayName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 3 && word === word.toUpperCase()) {
        return word;
      }

      return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function compareBrandGroups(first: BrandGroup, second: BrandGroup) {
  if (first.isOther !== second.isOther) {
    return first.isOther ? 1 : -1;
  }

  return first.firstResultIndex - second.firstResultIndex || first.name.localeCompare(second.name);
}

function getProductMeta(product: Product) {
  const size = formatProductSize(product.sizeQty, product.sizeUnit);

  return [product.brand, size].filter(Boolean).join(' · ') || 'Details unavailable';
}

function matchLabel(result: SearchResult) {
  if (!result.match || result.match.confidence === 'unknown') {
    return null;
  }

  if (result.match.confidence === 'mixed') {
    return 'matched';
  }

  return result.match.confidence === 'exact' ? 'same item' : 'new item';
}

const styles = StyleSheet.create({
  stage: {
    gap: Spacing.three,
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
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  detailHeader: {
    gap: Spacing.two,
  },
  backButton: {
    minHeight: 36,
    alignSelf: 'flex-start',
    borderRadius: Radii.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two + Spacing.half,
  },
  detailTitleBlock: {
    gap: Spacing.half,
  },
  productList: {
    gap: Spacing.two,
  },
  productCard: {
    gap: Spacing.two,
  },
  productHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  productCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  matchChip: {
    marginTop: Spacing.half,
  },
  productAction: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  addButton: {
    minWidth: 64,
  },
  pressed: {
    opacity: 0.72,
  },
});
