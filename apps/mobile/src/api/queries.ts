import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createCart,
  finalizeCart,
  getAlerts,
  getCurrentCart,
  getProductPrices,
  getStores,
  markAlertRead,
  removeWatch,
  searchProducts,
  updateCartItem,
  type AlertsResponse,
  type CartResponse,
} from '@/api/client';

const sortedStoreIds = (storeIds: string[]) => [...storeIds].sort();
export const currentCartQueryKey = ['cart', 'current'] as const;
export const cartOptimizationQueryKey = ['cart', 'optimization'] as const;
export const alertsQueryKey = ['alerts'] as const;

export function useStores(zip: string) {
  return useQuery({
    queryKey: ['stores', zip],
    queryFn: () => getStores(zip),
    enabled: zip.length === 5,
  });
}

export function useSearchProducts(query: string, storeIds: string[]) {
  const normalizedQuery = query.trim();
  const stableStoreIds = sortedStoreIds(storeIds);

  return useQuery({
    queryKey: ['search', normalizedQuery, stableStoreIds],
    queryFn: () => searchProducts(normalizedQuery, stableStoreIds),
    enabled: normalizedQuery.length >= 2 && stableStoreIds.length >= 1,
  });
}

export function useProductPrices(productId: string, storeIds: string[]) {
  const stableStoreIds = sortedStoreIds(storeIds);

  return useQuery({
    queryKey: ['product-prices', productId, stableStoreIds],
    queryFn: () => getProductPrices(productId, stableStoreIds),
    enabled: productId.length > 0 && stableStoreIds.length >= 1,
  });
}

export function useCurrentCart() {
  return useQuery({
    queryKey: currentCartQueryKey,
    queryFn: getCurrentCart,
  });
}

export function useCreateCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCart,
    onSuccess: (data) => {
      queryClient.setQueryData(currentCartQueryKey, data);
      queryClient.removeQueries({ queryKey: cartOptimizationQueryKey });
    },
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, qty }: { productId: string; qty: number }) =>
      updateCartItem(productId, qty),
    onSuccess: (data: CartResponse) => {
      queryClient.setQueryData(currentCartQueryKey, data);
      queryClient.removeQueries({ queryKey: cartOptimizationQueryKey });
    },
  });
}

export function useFinalizeCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (storeIds: string[]) => finalizeCart(sortedStoreIds(storeIds)),
    onSuccess: (data) => {
      queryClient.setQueryData(cartOptimizationQueryKey, data);
      queryClient.invalidateQueries({ queryKey: currentCartQueryKey });
    },
  });
}

export function useAlerts(enabled = true) {
  return useQuery({
    queryKey: alertsQueryKey,
    queryFn: getAlerts,
    enabled,
  });
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAlertRead,
    onSuccess: (updatedAlert) => {
      queryClient.setQueryData<AlertsResponse>(alertsQueryKey, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          alerts: current.alerts.map((alert) =>
            alert.id === updatedAlert.id ? updatedAlert : alert,
          ),
        };
      });
    },
  });
}

export function useRemoveWatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeWatch,
    onSuccess: (_data, watchId) => {
      queryClient.setQueryData<AlertsResponse>(alertsQueryKey, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          watches: current.watches.filter((watch) => watch.id !== watchId),
        };
      });
    },
  });
}
