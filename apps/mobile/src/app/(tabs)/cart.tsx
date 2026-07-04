import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreateCart, useCurrentCart, useFinalizeCart, useStores, useUpdateCartItem } from '@/api/queries';
import { CartQuantityStepper } from '@/components/cart-quantity-stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatProductSize } from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';

export default function CartScreen() {
  const zip = usePreferencesStore((state) => state.zip);
  const selectedStoreIds = usePreferencesStore((state) => state.selectedStoreIds);
  const cartQuery = useCurrentCart();
  const storesQuery = useStores(zip);
  const updateCartItem = useUpdateCartItem();
  const finalizeCart = useFinalizeCart();
  const createCart = useCreateCart();
  const theme = useTheme();

  const selectedStores = useMemo(() => {
    const selected = new Set(selectedStoreIds);
    return (storesQuery.data?.stores ?? []).filter((store) => selected.has(store.id));
  }, [selectedStoreIds, storesQuery.data?.stores]);

  const cart = cartQuery.data?.cart;
  const items = cart?.items ?? [];
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);
  const isEmpty = itemCount === 0;
  const isFinalized = cart?.status === 'finalized';

  const handleFinalize = () => {
    finalizeCart.mutate(selectedStoreIds, {
      onSuccess: () => router.push('/cart-results'),
    });
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <ThemedText type="subtitle">Cart</ThemedText>
              <ThemedText themeColor="textSecondary">
                {itemCount} {itemCount === 1 ? 'item' : 'items'} across {selectedStores.length} stores
              </ThemedText>
            </View>
          </View>

          {isFinalized ? (
            <ThemedView type="accentMuted" style={styles.finalizedBanner}>
              <View style={styles.bannerCopy}>
                <ThemedText type="smallBold" themeColor="accent">
                  Finalized
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Start a new cart when you are ready to compare another trip.
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={createCart.isPending}
                onPress={() => createCart.mutate()}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: theme.accent },
                  pressed && styles.pressed,
                  createCart.isPending && styles.disabled,
                ]}>
                <ThemedText type="smallBold" themeColor="accent">
                  Start new
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : null}

          {cartQuery.isLoading ? (
            <LoadingState />
          ) : cartQuery.isError ? (
            <MessageState title="Could not load cart" message="Pull prices again or try reopening Cartwise." />
          ) : isEmpty ? (
            <MessageState title="Your cart is empty" message="Add groceries from search to compare a full basket." />
          ) : (
            <View style={styles.itemList}>
              {items.map((item) => {
                const size = formatProductSize(item.product.sizeQty, item.product.sizeUnit);

                return (
                  <ThemedView key={item.productId} type="backgroundElement" style={styles.itemRow}>
                    <View style={styles.itemCopy}>
                      <ThemedText type="smallBold">{item.product.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[item.product.brand, size].filter(Boolean).join(' · ')}
                      </ThemedText>
                    </View>
                    <View style={styles.itemActions}>
                      <CartQuantityStepper
                        compact
                        qty={item.qty}
                        disabled={updateCartItem.isPending}
                        onChange={(qty) => updateCartItem.mutate({ productId: item.productId, qty })}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.product.name}`}
                        disabled={updateCartItem.isPending}
                        hitSlop={8}
                        onPress={() => updateCartItem.mutate({ productId: item.productId, qty: 0 })}
                        style={({ pressed }) => [
                          styles.removeButton,
                          pressed && styles.pressed,
                          updateCartItem.isPending && styles.disabled,
                        ]}>
                        <ThemedText type="smallBold" themeColor="danger">
                          Remove
                        </ThemedText>
                      </Pressable>
                    </View>
                  </ThemedView>
                );
              })}
            </View>
          )}

          {finalizeCart.isError ? (
            <ThemedView type="backgroundElement" style={styles.errorPanel}>
              <ThemedText type="smallBold" themeColor="danger">
                Could not finalize cart
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Check your connection and try again.
              </ThemedText>
            </ThemedView>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={isEmpty || finalizeCart.isPending}
            onPress={handleFinalize}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: isEmpty ? theme.backgroundSelected : theme.accent },
              pressed && styles.pressed,
              (isEmpty || finalizeCart.isPending) && styles.disabled,
            ]}>
            <ThemedText type="smallBold" style={styles.primaryButtonText}>
              {finalizeCart.isPending ? 'Finding cheapest store...' : 'Find my cheapest store'}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function LoadingState() {
  return (
    <ThemedView type="backgroundElement" style={styles.messageState}>
      <ActivityIndicator color="#16a34a" />
    </ThemedView>
  );
}

function MessageState({ title, message }: { title: string; message: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.messageState}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.messageText}>
        {message}
      </ThemedText>
    </ThemedView>
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
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  finalizedBanner: {
    borderRadius: 8,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  bannerCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  secondaryButton: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  itemList: {
    gap: Spacing.three,
  },
  itemRow: {
    borderRadius: 8,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  itemCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  itemActions: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  removeButton: {
    minHeight: 28,
    justifyContent: 'center',
  },
  messageState: {
    minHeight: 180,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.one,
  },
  messageText: {
    textAlign: 'center',
  },
  errorPanel: {
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.5,
  },
});
