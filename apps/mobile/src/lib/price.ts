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

type ComparableUnit = 'oz' | 'fl oz' | 'ct' | 'g' | 'ml';

type ComparableSize = {
  qty: number;
  unit: ComparableUnit;
};

const unitAliases = new Map<string, ComparableUnit | 'lb' | 'gal' | 'qt' | 'pt' | 'l' | 'kg'>([
  ['ounce', 'oz'],
  ['ounces', 'oz'],
  ['oz', 'oz'],
  ['pound', 'lb'],
  ['pounds', 'lb'],
  ['lb', 'lb'],
  ['lbs', 'lb'],
  ['fl ounce', 'fl oz'],
  ['fl ounces', 'fl oz'],
  ['fl oz', 'fl oz'],
  ['floz', 'fl oz'],
  ['fluid ounce', 'fl oz'],
  ['fluid ounces', 'fl oz'],
  ['gallon', 'gal'],
  ['gallons', 'gal'],
  ['gal', 'gal'],
  ['quart', 'qt'],
  ['quarts', 'qt'],
  ['qt', 'qt'],
  ['pint', 'pt'],
  ['pints', 'pt'],
  ['pt', 'pt'],
  ['count', 'ct'],
  ['counts', 'ct'],
  ['ct', 'ct'],
  ['each', 'ct'],
  ['ea', 'ct'],
  ['gram', 'g'],
  ['grams', 'g'],
  ['g', 'g'],
  ['kilogram', 'kg'],
  ['kilograms', 'kg'],
  ['kg', 'kg'],
  ['milliliter', 'ml'],
  ['milliliters', 'ml'],
  ['ml', 'ml'],
  ['liter', 'l'],
  ['liters', 'l'],
  ['l', 'l'],
]);

export function formatUnitPriceLabel(
  price: number,
  sizeQty: number | null,
  sizeUnit: string | null,
) {
  const comparableSize = toComparableSize(sizeQty, sizeUnit);
  if (!comparableSize || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const basis = unitPriceBasis(comparableSize.unit);
  const unitPrice = (price / comparableSize.qty) * basis.qty;

  return `${formatPrice(unitPrice)}/${basis.label}`;
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

function toComparableSize(
  sizeQty: number | null,
  sizeUnit: string | null,
): ComparableSize | null {
  if (sizeQty === null || sizeQty <= 0 || !Number.isFinite(sizeQty) || sizeUnit === null) {
    return null;
  }

  const normalizedUnit = unitAliases.get(sizeUnit.trim().toLowerCase());
  switch (normalizedUnit) {
    case 'oz':
    case 'fl oz':
    case 'ct':
    case 'g':
    case 'ml':
      return { qty: sizeQty, unit: normalizedUnit };
    case 'lb':
      return { qty: sizeQty * 16, unit: 'oz' };
    case 'gal':
      return { qty: sizeQty * 128, unit: 'fl oz' };
    case 'qt':
      return { qty: sizeQty * 32, unit: 'fl oz' };
    case 'pt':
      return { qty: sizeQty * 16, unit: 'fl oz' };
    case 'kg':
      return { qty: sizeQty * 1_000, unit: 'g' };
    case 'l':
      return { qty: sizeQty * 1_000, unit: 'ml' };
    default:
      return null;
  }
}

function unitPriceBasis(unit: ComparableUnit): { qty: number; label: string } {
  if (unit === 'g') {
    return { qty: 100, label: '100g' };
  }

  if (unit === 'ml') {
    return { qty: 100, label: '100ml' };
  }

  return { qty: 1, label: unit };
}
