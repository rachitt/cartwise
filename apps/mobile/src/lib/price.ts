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

const FRESHNESS_UNKNOWN_LABEL = 'freshness unknown';

export function formatRelativeTime(isoDate?: string | null) {
  const timestamp = typeof isoDate === 'string' ? Date.parse(isoDate) : NaN;
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const elapsedMs = Math.max(0, Date.now() - timestamp);
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

export function formatFreshnessStamp(isoDate?: string | null) {
  const relativeTime = formatRelativeTime(isoDate);
  return relativeTime ? `as of ${relativeTime}` : FRESHNESS_UNKNOWN_LABEL;
}

export type FreshnessTone = 'fresh' | 'aging' | 'stale';

const FRESH_HOURS = 6;
const AGING_HOURS = 48;

/** Classify price age for the FreshnessStamp status dot. Unknown dates read as stale. */
export function freshnessTone(isoDate?: string | null): FreshnessTone {
  const timestamp = typeof isoDate === 'string' ? Date.parse(isoDate) : NaN;
  if (!Number.isFinite(timestamp)) {
    return 'stale';
  }

  const ageHours = (Date.now() - timestamp) / 3_600_000;
  if (ageHours <= FRESH_HOURS) {
    return 'fresh';
  }
  return ageHours <= AGING_HOURS ? 'aging' : 'stale';
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
