import type { CartOptimization } from '@cartwise/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cartOptimizationQueryKey, useCurrentCart, useStores } from '@/api/queries';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chainLabel, formatFreshnessStamp, formatPrice, formatProductSize } from '@/lib/price';
import { usePreferencesStore } from '@/state/preferences';

const reasonLabel: Record<CartOptimization['swapSuggestions'][number]['reason'], string> = {
  'cheaper-brand': 'cheaper brand',
  'better-unit-price': 'better unit price',
};

export default function CartResultsScreen() {
  const queryClient = useQueryClient();
  const optimization = queryClient.getQueryData<CartOptimization>(cartOptimizationQueryKey);
  const zip = usePreferencesStore((state) => state.zip);
  const cartQuery = useCurrentCart();
  const storesQuery = useStores(zip);
  const theme = useTheme();

  const storeById = useMemo(
    () => new Map((storesQuery.data?.stores ?? []).map((store) => [store.id, store])),
    [storesQuery.data?.stores],
  );
  const productById = useMemo(
    () => new Map((cartQuery.data?.cart.items ?? []).map((item) => [item.productId, item.product])),
    [cartQuery.data?.cart.items],
  );

  if (!optimization) {
    return (
      <ScreenShell>
        <MessageState
          title="No cart results yet"
          message="Finalize your cart to compare totals across nearby stores."
        />
        <BackButton label="Back to cart" />
      </ScreenShell>
    );
  }

  if (cartQuery.isError || storesQuery.isError) {
    return (
      <ScreenShell>
        <MessageState
          title="Could not load results"
          message="The optimization finished, but Cartwise could not reload the cart or store details."
        />
        <BackButton label="Back to cart" />
      </ScreenShell>
    );
  }

  const winningStore = storeById.get(optimization.winningStoreId);
  const worstStoreTotal = optimization.perStoreTotals.find(
    (storeTotal) => storeTotal.total === optimization.worstTotal,
  );
  const worstStore = worstStoreTotal ? storeById.get(worstStoreTotal.storeId) : undefined;
  const cartItems = cartQuery.data?.cart.items ?? [];

  return (
    <ScreenShell>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
        <ThemedText type="linkPrimary">Back</ThemedText>
      </Pressable>

      <ThemedView type="accentMuted" style={[styles.heroCard, { borderColor: theme.accent }]}>
        <ThemedText type="smallBold" themeColor="accent">
          Winning store
        </ThemedText>
        <ThemedText type="subtitle">{winningStore?.name ?? 'Selected store'}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {winningStore ? chainLabel(winningStore.chain) : optimization.winningStoreId}
        </ThemedText>
        <ThemedText type="title" themeColor="accent" style={styles.heroTotal}>
          {formatPrice(optimization.winningTotal)}
        </ThemedText>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.panel}>
        <ThemedText type="smallBold">
          You save {formatPrice(optimization.savings)} vs {worstStore?.name ?? 'the highest total'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatFreshnessStamp(optimization.pricesAsOf)}
        </ThemedText>
      </ThemedView>

      <View style={styles.section}>
        <ThemedText type="smallBold">Store totals</ThemedText>
        {optimization.perStoreTotals.map((storeTotal) => {
          const store = storeById.get(storeTotal.storeId);
          const isWinningStore = storeTotal.storeId === optimization.winningStoreId;

          return (
            <ThemedView key={storeTotal.storeId} type="backgroundElement" style={styles.totalRow}>
              <View style={styles.storeCopy}>
                <ThemedText type="smallBold">{store?.name ?? storeTotal.storeId}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {store ? chainLabel(store.chain) : 'Selected store'}
                </ThemedText>
                {storeTotal.missingItems.length > 0 ? (
                  <ThemedText type="smallBold" themeColor="danger">
                    {storeTotal.missingItems.length} missing
                  </ThemedText>
                ) : null}
              </View>
              <View style={styles.totalCopy}>
                {isWinningStore ? (
                  <ThemedView type="accentMuted" style={styles.winnerBadge}>
                    <ThemedText type="smallBold" themeColor="accent">
                      Best
                    </ThemedText>
                  </ThemedView>
                ) : null}
                <ThemedText type="smallBold">{formatPrice(storeTotal.total)}</ThemedText>
              </View>
            </ThemedView>
          );
        })}
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">Cart items</ThemedText>
        {cartItems.length === 0 ? (
          <MessageState title="No items found" message="Cart item details are unavailable for this result." />
        ) : (
          cartItems.map((item) => {
            const size = formatProductSize(item.product.sizeQty, item.product.sizeUnit);
            const cheaperFlags = optimization.cheaperElsewhere.filter(
              (flag) => flag.productId === item.productId,
            );

            return (
              <ThemedView key={item.productId} type="backgroundElement" style={styles.itemPanel}>
                <View style={styles.itemHeader}>
                  <View style={styles.storeCopy}>
                    <ThemedText type="smallBold">{item.product.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[item.product.brand, size, `Qty ${item.qty}`].filter(Boolean).join(' · ')}
                    </ThemedText>
                  </View>
                </View>
                {cheaperFlags.map((flag) => {
                  const store = storeById.get(flag.storeId);
                  return (
                    <ThemedView key={`${flag.productId}-${flag.storeId}`} type="accentMuted" style={styles.flag}>
                      <ThemedText type="smallBold" themeColor="accent">
                        Cheaper at {store?.name ?? flag.storeId}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatPrice(flag.price)} each, {formatPrice(flag.delta)} less
                      </ThemedText>
                    </ThemedView>
                  );
                })}
              </ThemedView>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">Swap suggestions</ThemedText>
        {optimization.swapSuggestions.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedText type="small" themeColor="textSecondary">
              No strong swaps found for this cart.
            </ThemedText>
          </ThemedView>
        ) : (
          optimization.swapSuggestions.map((suggestion) => {
            const fromProduct = productById.get(suggestion.fromProductId);

            return (
              <ThemedView
                key={`${suggestion.fromProductId}-${suggestion.toProductId}`}
                type="backgroundElement"
                style={styles.suggestionRow}>
                <View style={styles.storeCopy}>
                  <ThemedText type="smallBold">
                    {fromProduct?.name ?? formatProductId(suggestion.fromProductId)} to{' '}
                    {formatProductId(suggestion.toProductId)}
                  </ThemedText>
                  <ThemedView type="accentMuted" style={styles.reasonBadge}>
                    <ThemedText type="smallBold" themeColor="accent">
                      {reasonLabel[suggestion.reason]}
                    </ThemedText>
                  </ThemedView>
                </View>
                <ThemedText type="smallBold" themeColor="accent">
                  Save {formatPrice(suggestion.savings)}
                </ThemedText>
              </ThemedView>
            );
          })
        )}
      </View>
    </ScreenShell>
  );
}

function ScreenShell({ children }: { children: ReactNode }) {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
          {children}
        </ScrollView>
      </SafeAreaView>
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

function BackButton({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.replace('/cart')}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: theme.accent },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={styles.primaryButtonText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function formatProductId(productId: string) {
  return productId
    .split('-')
    .filter((part) => part !== 'store')
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
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  heroCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  heroTotal: {
    marginTop: Spacing.two,
  },
  panel: {
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  totalRow: {
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
  totalCopy: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  winnerBadge: {
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  itemPanel: {
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flag: {
    borderRadius: 8,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  suggestionRow: {
    borderRadius: 8,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  reasonBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
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
  primaryButton: {
    minHeight: 52,
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
});
