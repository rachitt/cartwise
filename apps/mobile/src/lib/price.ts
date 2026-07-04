import type { Store, StorePrice } from '@cartwise/shared';

export function effectivePrice(price: StorePrice) {
  return price.promoPrice ?? price.price;
}

export function formatPrice(value: number) {
  return `$${value.toFixed(2)}`;
}

export function formatProductSize(sizeQty: number | null, sizeUnit: string | null) {
  if (sizeQty === null || sizeUnit === null) {
    return null;
  }

  return `${sizeQty} ${sizeUnit}`;
}

export function formatRelativeTime(isoDate: string) {
  const elapsedMs = Date.now() - new Date(isoDate).getTime();
  const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} hr ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
}

export function chainLabel(chain: Store['chain']) {
  switch (chain) {
    case 'kroger':
      return 'Kroger';
    case 'target':
      return 'Target';
    case 'walmart':
      return 'Walmart';
    case 'aldi':
      return 'ALDI';
  }
}

export function storeBadge(store?: Store) {
  return store ? chainLabel(store.chain) : 'Store';
}
