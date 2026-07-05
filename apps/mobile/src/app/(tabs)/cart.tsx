import { router } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CartItem } from '@/api/client';
import {
  useCreateCart,
  useCurrentCart,
  useFinalizeCart,
  useStores,
  useUpdateCartItem,
} from '@/api/queries';
import { CartQuantityStepper } from '@/components/cart/cart-quantity-stepper';
import { ProductThumb } from '@/components/ui/product-thumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { BottomTabInset, MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatProductSize } from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';

const WARNING_ICON = {
  ios: 'exclamationmark.triangle',
  android: 'warning',
  web: 'warning',
} satisfies SymbolViewProps['name'];

const CART_ICON = {
  ios: 'cart',
  android: 'shopping_cart',
  web: 'shopping_cart',
} satisfies SymbolViewProps['name'];

export default function CartScreen() {
  const zip = usePreferencesStore((state) => state.zip);
  const cartQuery = useCurrentCart();
  const storesQuery = useStores(zip);
  const updateCartItem = useUpdateCartItem();
  const finalizeCart = useFinalizeCart();
  const createCart = useCreateCart();
  const theme = useTheme();

  const activeStores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const activeStoreIds = useMemo(() => activeStores.map((store) => store.id), [activeStores]);

  const cart = cartQuery.data?.cart;
  const items = cart?.items ?? [];
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);
  const isEmpty = itemCount === 0;
  const isFinalized = cart?.status === 'finalized';
  const finalizeDisabled =
    isEmpty || activeStoreIds.length === 0 || storesQuery.isLoading || finalizeCart.isPending;

  const handleFinalize = () => {
    if (activeStoreIds.length === 0) {
      return;
    }

    finalizeCart.mutate(activeStoreIds, {
      onSuccess: () => router.push('/cart-results'),
    });
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
          <View style={styles.header}>
            <ThemedText type="eyebrow">CARTWISE</ThemedText>
            <ThemedText type="display">Cart</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatCount(itemCount, 'item')} · compared across{' '}
              {formatCount(activeStores.length, 'store')}
            </ThemedText>
          </View>

          {isFinalized ? (
            <Card
              style={[
                styles.finalizedBanner,
                { backgroundColor: theme.accentMuted, borderColor: theme.accentMuted },
              ]}>
              <View style={styles.bannerCopy}>
                <Chip label="Finalized" tone="accent" />
                <ThemedText type="small" themeColor="textSecondary">
                  Prices locked for this run.
                </ThemedText>
              </View>
              <AppButton
                label="Start a new cart"
                variant="secondary"
                loading={createCart.isPending}
                onPress={() => createCart.mutate()}
                style={styles.bannerButton}
              />
            </Card>
          ) : null}

          {cartQuery.isLoading ? (
            <CartSkeleton />
          ) : cartQuery.isError ? (
            <EmptyState
              icon={WARNING_ICON}
              title="Could not load cart"
              message="Pull prices again or try reopening Cartwise."
            />
          ) : isEmpty ? (
            <EmptyState
              icon={CART_ICON}
              title="Your cart is empty"
              message="Add items from Search to compare store totals."
            />
          ) : (
            <Card flush>
              {items.map((item, index) => (
                <CartItemRow
                  key={item.productId}
                  disabled={updateCartItem.isPending}
                  item={item}
                  showSeparator={index < items.length - 1}
                  onQtyChange={(qty) => updateCartItem.mutate({ productId: item.productId, qty })}
                  onRemove={() => updateCartItem.mutate({ productId: item.productId, qty: 0 })}
                />
              ))}
            </Card>
          )}

          {finalizeCart.isError ? (
            <Card
              style={[
                styles.finalizeError,
                { backgroundColor: theme.dangerMuted, borderColor: theme.dangerMuted },
              ]}>
              <ThemedText type="small" themeColor="danger">
                Could not finalize cart. Check your connection and try again.
              </ThemedText>
            </Card>
          ) : null}

          <AppButton
            label="Find my cheapest store"
            size="lg"
            haptic="success"
            loading={finalizeCart.isPending}
            disabled={finalizeDisabled}
            onPress={handleFinalize}
            style={styles.footerButton}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function CartItemRow({
  disabled,
  item,
  showSeparator,
  onQtyChange,
  onRemove,
}: {
  disabled: boolean;
  item: CartItem;
  showSeparator: boolean;
  onQtyChange: (qty: number) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const size = formatProductSize(item.product.sizeQty, item.product.sizeUnit);
  const meta = [item.product.brand, size].filter(Boolean).join(' · ');

  return (
    <View
      style={[
        styles.itemRow,
        showSeparator && styles.rowSeparator,
        showSeparator && { borderBottomColor: theme.border },
      ]}>
      <ProductThumb imageUrl={item.product.imageUrl} name={item.product.name} size={44} />
      <View style={styles.itemCopy}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {item.product.name}
        </ThemedText>
        {meta ? (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {meta}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.itemActions}>
        <CartQuantityStepper qty={item.qty} disabled={disabled} onChange={onQtyChange} />
        <AppButton
          label="Remove"
          variant="ghost"
          disabled={disabled}
          onPress={onRemove}
          style={styles.removeButton}
        />
      </View>
    </View>
  );
}

function CartSkeleton() {
  const theme = useTheme();

  return (
    <Card flush>
      {[0, 1, 2].map((item, index) => (
        <View
          key={item}
          style={[
            styles.skeletonRow,
            index < 2 && styles.rowSeparator,
            index < 2 && styles.skeletonSeparator,
            index < 2 && { borderBottomColor: theme.border },
          ]}>
          <View style={styles.skeletonCopy}>
            <Skeleton height={16} width="74%" />
            <Skeleton height={12} width="52%" />
          </View>
          <Skeleton height={44} width={132} radius={Radii.control} />
        </View>
      ))}
    </Card>
  );
}

function formatCount(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
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
    gap: Spacing.one,
  },
  finalizedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  bannerCopy: {
    flex: 1,
    minWidth: 160,
    gap: Spacing.two,
  },
  bannerButton: {
    flexShrink: 0,
  },
  itemRow: {
    minHeight: 76,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowSeparator: {
    borderBottomWidth: 1,
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  itemActions: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  removeButton: {
    minHeight: 36,
    paddingHorizontal: Spacing.two,
  },
  finalizeError: {
    paddingVertical: Spacing.three,
  },
  footerButton: {
    marginTop: Spacing.one,
  },
  skeletonRow: {
    minHeight: 76,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  skeletonSeparator: {
    borderBottomWidth: 1,
  },
  skeletonCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.two,
  },
});
