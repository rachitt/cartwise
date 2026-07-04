import type { CartOptimization, Product, Store, StorePrice } from '@cartwise/shared';

import {
  createMockCart,
  finalizeMockCart,
  getMockCurrentCart,
  getMockProductPrices,
  getMockStores,
  searchMockProducts,
  updateMockCartItem,
} from '@/api/mocks';
import { getDeviceId } from '@/lib/device-id';

export type StoresResponse = { stores: Store[] };
export type SearchResult = { product: Product; prices: StorePrice[] };
export type SearchResponse = { results: SearchResult[] };
export type ProductPricesResponse = { product: Product; prices: StorePrice[] };
export type CartStatus = 'open' | 'finalized';
export type CartItem = { productId: string; qty: number; product: Product };
export type Cart = { id: string; status: CartStatus; items: CartItem[] };
export type CartResponse = { cart: Cart };

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS === '1';
const REQUEST_TIMEOUT_MS = 4000;

type RequestJsonOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  requiresDeviceId?: boolean;
};

function toStoreIdsParam(storeIds: string[]) {
  return storeIds.join(',');
}

async function requestJson<T>(
  path: string,
  fallback: () => T | Promise<T>,
  options: RequestJsonOptions = {},
): Promise<T> {
  if (USE_MOCKS) {
    return fallback();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = new Headers({ Accept: 'application/json' });
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (options.requiresDeviceId) {
      headers.set('x-device-id', await getDeviceId());
    }

    const response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
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

export function createCart() {
  return requestJson<CartResponse>('/carts', createMockCart, {
    method: 'POST',
    requiresDeviceId: true,
  });
}

export function getCurrentCart() {
  return requestJson<CartResponse>('/carts/current', getMockCurrentCart, {
    requiresDeviceId: true,
  });
}

export function updateCartItem(productId: string, qty: number) {
  return requestJson<CartResponse>(
    '/carts/current/items',
    () => updateMockCartItem(productId, qty),
    {
      method: 'PUT',
      body: { productId, qty },
      requiresDeviceId: true,
    },
  );
}

export function finalizeCart(storeIds: string[]) {
  return requestJson<CartOptimization>(
    '/carts/current/finalize',
    () => finalizeMockCart(storeIds),
    {
      method: 'POST',
      body: { storeIds },
      requiresDeviceId: true,
    },
  );
}
