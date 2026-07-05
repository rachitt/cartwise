import type { CartOptimization, Product, Store, StorePrice } from '@cartwise/shared';
import Constants from 'expo-constants';

import { getDeviceId } from '@/lib/device-id';

export type StoresResponse = { stores: Store[] };
export type SearchResult = { product: Product; prices: StorePrice[] };
export type SearchResponse = { results: SearchResult[] };
export type ProductPricesResponse = { product: Product; prices: StorePrice[] };
export type CartStatus = 'open' | 'finalized';
export type CartItem = { productId: string; qty: number; product: Product };
export type Cart = { id: string; status: CartStatus; items: CartItem[] };
export type CartResponse = { cart: Cart };
export type PriceAlert = {
  id: string;
  productName: string;
  storeName: string;
  oldPrice: number;
  newPrice: number;
  capturedAt: string;
  read: boolean;
};
export type PriceWatch = {
  id: string;
  productName: string;
  baselinePrice: number;
  active: boolean;
  storeIds: string[];
};
export type AlertsResponse = { alerts: PriceAlert[]; watches: PriceWatch[] };
export type PushTokenResponse = { ok: true };

const DEV_API_FALLBACK_URL = 'http://localhost:3000';
const API_URL = resolveApiUrl();
const REQUEST_TIMEOUT_MS = 25000;

type RequestJsonOptions = {
  method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
  body?: unknown;
  requiresDeviceId?: boolean;
};

function toStoreIdsParam(storeIds: string[]) {
  return storeIds.join(',');
}

function resolveApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  if (__DEV__) {
    return getDevApiUrl();
  }

  throw new Error(
    'Missing EXPO_PUBLIC_API_URL. Set it to the Cartwise API origin before creating a production build.',
  );
}

function getDevApiUrl() {
  const devServerHost = getDevServerHost(Constants.expoConfig?.hostUri);
  return devServerHost ? `http://${formatHostForUrl(devServerHost)}:3000` : DEV_API_FALLBACK_URL;
}

function getDevServerHost(hostUri: string | undefined) {
  if (!hostUri) {
    return null;
  }

  const normalizedHostUri = hostUri.includes('://') ? hostUri : `http://${hostUri}`;
  try {
    return new URL(normalizedHostUri).hostname;
  } catch {
    const hostMatch = hostUri.match(/^(?:[^:/?#]+:\/\/)?(\[[^\]]+\]|[^:/?#]+)/);
    return hostMatch?.[1] ?? null;
  }
}

function formatHostForUrl(host: string) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

async function requestJson<T>(path: string, options: RequestJsonOptions = {}): Promise<T> {
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
  } finally {
    clearTimeout(timeout);
  }
}

export function getStores(zip: string) {
  const params = new URLSearchParams({ zip });
  return requestJson<StoresResponse>(`/stores?${params.toString()}`);
}

export function searchProducts(query: string, storeIds: string[]) {
  const params = new URLSearchParams({ q: query, storeIds: toStoreIdsParam(storeIds) });
  return requestJson<SearchResponse>(`/search?${params.toString()}`);
}

export function getProductPrices(productId: string, storeIds: string[]) {
  const params = new URLSearchParams({ storeIds: toStoreIdsParam(storeIds) });
  return requestJson<ProductPricesResponse>(`/products/${productId}/prices?${params.toString()}`);
}

export function createCart() {
  return requestJson<CartResponse>('/carts', {
    method: 'POST',
    requiresDeviceId: true,
  });
}

export function getCurrentCart() {
  return requestJson<CartResponse>('/carts/current', {
    requiresDeviceId: true,
  });
}

export function updateCartItem(productId: string, qty: number) {
  return requestJson<CartResponse>('/carts/current/items', {
    method: 'PUT',
    body: { productId, qty },
    requiresDeviceId: true,
  });
}

export function finalizeCart(storeIds: string[]) {
  return requestJson<CartOptimization>('/carts/current/finalize', {
    method: 'POST',
    body: { storeIds },
    requiresDeviceId: true,
  });
}

export function registerPushToken(expoPushToken: string) {
  return requestJson<PushTokenResponse>('/push-tokens', {
    method: 'POST',
    body: { expoPushToken },
    requiresDeviceId: true,
  });
}

export function getAlerts() {
  return requestJson<AlertsResponse>('/alerts', {
    requiresDeviceId: true,
  });
}

export function markAlertRead(alertId: string) {
  return requestJson<PriceAlert>(`/alerts/${alertId}/read`, {
    method: 'PUT',
    requiresDeviceId: true,
  });
}

export function removeWatch(watchId: string) {
  return requestJson<PushTokenResponse>(`/watches/${watchId}`, {
    method: 'DELETE',
    requiresDeviceId: true,
  });
}
