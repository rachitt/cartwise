import { useQuery } from '@tanstack/react-query';

import { getProductPrices, getStores, searchProducts } from '@/api/client';

const sortedStoreIds = (storeIds: string[]) => [...storeIds].sort();

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
    enabled: normalizedQuery.length >= 2 && stableStoreIds.length >= 2,
  });
}

export function useProductPrices(productId: string, storeIds: string[]) {
  const stableStoreIds = sortedStoreIds(storeIds);

  return useQuery({
    queryKey: ['product-prices', productId, stableStoreIds],
    queryFn: () => getProductPrices(productId, stableStoreIds),
    enabled: productId.length > 0 && stableStoreIds.length >= 2,
  });
}
