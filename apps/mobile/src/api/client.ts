import type { Product, Store, StorePrice } from '@cartwise/shared';

import { getMockProductPrices, getMockStores, searchMockProducts } from '@/api/mocks';

export type StoresResponse = { stores: Store[] };
export type SearchResult = { product: Product; prices: StorePrice[] };
export type SearchResponse = { results: SearchResult[] };
export type ProductPricesResponse = { product: Product; prices: StorePrice[] };

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS === '1';
const REQUEST_TIMEOUT_MS = 4000;

function toStoreIdsParam(storeIds: string[]) {
  return storeIds.join(',');
}

async function requestJson<T>(path: string, fallback: () => T): Promise<T> {
  if (USE_MOCKS) {
    return fallback();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}${path}`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Cartwise API returned ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    // Mock fallback is a dev convenience only — production must surface the
    // error rather than show fabricated prices.
    if (__DEV__) {
      return fallback();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function getStores(zip: string) {
  const params = new URLSearchParams({ zip });
  return requestJson<StoresResponse>(`/stores?${params.toString()}`, getMockStores);
}

export function searchProducts(query: string, storeIds: string[]) {
  const params = new URLSearchParams({ q: query, storeIds: toStoreIdsParam(storeIds) });
  return requestJson<SearchResponse>(`/search?${params.toString()}`, () =>
    searchMockProducts(query, storeIds),
  );
}

export function getProductPrices(productId: string, storeIds: string[]) {
  const params = new URLSearchParams({ storeIds: toStoreIdsParam(storeIds) });
  return requestJson<ProductPricesResponse>(`/products/${productId}/prices?${params.toString()}`, () =>
    getMockProductPrices(productId, storeIds),
  );
}
