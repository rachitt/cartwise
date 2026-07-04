import type { CartOptimization, Product, Store, StorePrice, SwapSuggestion } from '@cartwise/shared';

import type { Cart, PriceAlert, PriceWatch } from '@/api/client';

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

export const mockStores: Store[] = [
  {
    id: 'kroger-downtown-45202',
    chain: 'kroger',
    name: 'Kroger Downtown Cincinnati',
    address: '100 E Court St, Cincinnati, OH 45202',
    zip: '45202',
    lat: 39.1065,
    lng: -84.5119,
    distanceMiles: 0.6,
  },
  {
    id: 'target-newport-45202',
    chain: 'target',
    name: 'Target Newport Pavilion',
    address: '160 Pavilion Pkwy, Newport, KY 41071',
    zip: '45202',
    lat: 39.0886,
    lng: -84.4773,
    distanceMiles: 2.4,
  },
  {
    id: 'walmart-fort-wright-45202',
    chain: 'walmart',
    name: 'Walmart Fort Wright',
    address: '3450 Valley Plaza Pkwy, Fort Wright, KY 41017',
    zip: '45202',
    lat: 39.0515,
    lng: -84.5326,
    distanceMiles: 4.6,
  },
];

export const mockProducts: Product[] = [
  {
    id: 'whole-milk-half-gallon',
    name: 'Whole Milk',
    brand: 'Horizon Organic',
    sizeQty: 64,
    sizeUnit: 'fl oz',
    upc: '742365264012',
    category: 'Dairy',
    imageUrl: null,
  },
  {
    id: 'large-eggs-dozen',
    name: 'Large Brown Eggs',
    brand: 'Good & Gather',
    sizeQty: 12,
    sizeUnit: 'ct',
    upc: '085239098514',
    category: 'Dairy',
    imageUrl: null,
  },
  {
    id: 'sandwich-bread',
    name: 'Soft Sandwich Bread',
    brand: 'Sara Lee',
    sizeQty: 20,
    sizeUnit: 'oz',
    upc: '072945601235',
    category: 'Bakery',
    imageUrl: null,
  },
  {
    id: 'bananas-bunch',
    name: 'Bananas',
    brand: null,
    sizeQty: 1,
    sizeUnit: 'lb',
    upc: null,
    category: 'Produce',
    imageUrl: null,
  },
  {
    id: 'avocados-bag',
    name: 'Hass Avocados',
    brand: null,
    sizeQty: 4,
    sizeUnit: 'ct',
    upc: null,
    category: 'Produce',
    imageUrl: null,
  },
  {
    id: 'chicken-breast',
    name: 'Boneless Skinless Chicken Breast',
    brand: 'Perdue',
    sizeQty: 1,
    sizeUnit: 'lb',
    upc: '072745806559',
    category: 'Meat',
    imageUrl: null,
  },
  {
    id: 'ground-beef',
    name: 'Ground Beef 85% Lean',
    brand: 'Private Selection',
    sizeQty: 1,
    sizeUnit: 'lb',
    upc: '011110979943',
    category: 'Meat',
    imageUrl: null,
  },
  {
    id: 'cheddar-shreds',
    name: 'Sharp Cheddar Shredded Cheese',
    brand: 'Kraft',
    sizeQty: 8,
    sizeUnit: 'oz',
    upc: '021000055085',
    category: 'Dairy',
    imageUrl: null,
  },
  {
    id: 'greek-yogurt',
    name: 'Plain Greek Yogurt',
    brand: 'Chobani',
    sizeQty: 32,
    sizeUnit: 'oz',
    upc: '818290010003',
    category: 'Dairy',
    imageUrl: null,
  },
  {
    id: 'peanut-butter',
    name: 'Creamy Peanut Butter',
    brand: 'Jif',
    sizeQty: 16,
    sizeUnit: 'oz',
    upc: '051500255162',
    category: 'Pantry',
    imageUrl: null,
  },
  {
    id: 'spaghetti',
    name: 'Spaghetti Pasta',
    brand: 'Barilla',
    sizeQty: 16,
    sizeUnit: 'oz',
    upc: '076808280333',
    category: 'Pantry',
    imageUrl: null,
  },
  {
    id: 'tomato-sauce',
    name: 'Tomato Basil Pasta Sauce',
    brand: "Rao's",
    sizeQty: 24,
    sizeUnit: 'oz',
    upc: '747479000017',
    category: 'Pantry',
    imageUrl: null,
  },
  {
    id: 'store-brand-milk-half-gallon',
    name: 'Whole Milk',
    brand: 'Kroger',
    sizeQty: 64,
    sizeUnit: 'fl oz',
    upc: '011110123456',
    category: 'Dairy',
    imageUrl: null,
  },
  {
    id: 'store-brand-eggs-dozen',
    name: 'Large Grade A Eggs',
    brand: 'Great Value',
    sizeQty: 12,
    sizeUnit: 'ct',
    upc: '078742192837',
    category: 'Dairy',
    imageUrl: null,
  },
  {
    id: 'store-brand-sandwich-bread',
    name: 'Soft White Sandwich Bread',
    brand: 'Market Pantry',
    sizeQty: 20,
    sizeUnit: 'oz',
    upc: '085239111222',
    category: 'Bakery',
    imageUrl: null,
  },
  {
    id: 'market-bananas',
    name: 'Yellow Bananas',
    brand: 'Market Fresh',
    sizeQty: 1,
    sizeUnit: 'lb',
    upc: null,
    category: 'Produce',
    imageUrl: null,
  },
  {
    id: 'single-avocados',
    name: 'Hass Avocados',
    brand: 'Market Fresh',
    sizeQty: 4,
    sizeUnit: 'ct',
    upc: null,
    category: 'Produce',
    imageUrl: null,
  },
  {
    id: 'store-brand-chicken-breast',
    name: 'Boneless Skinless Chicken Breast',
    brand: 'Kroger',
    sizeQty: 1,
    sizeUnit: 'lb',
    upc: '011110806559',
    category: 'Meat',
    imageUrl: null,
  },
  {
    id: 'ground-turkey',
    name: 'Ground Turkey 93% Lean',
    brand: 'Good & Gather',
    sizeQty: 1,
    sizeUnit: 'lb',
    upc: '085239444555',
    category: 'Meat',
    imageUrl: null,
  },
  {
    id: 'store-brand-cheddar-shreds',
    name: 'Sharp Cheddar Shredded Cheese',
    brand: 'Great Value',
    sizeQty: 8,
    sizeUnit: 'oz',
    upc: '078742555666',
    category: 'Dairy',
    imageUrl: null,
  },
  {
    id: 'store-brand-greek-yogurt',
    name: 'Plain Greek Yogurt',
    brand: 'Good & Gather',
    sizeQty: 32,
    sizeUnit: 'oz',
    upc: '085239777888',
    category: 'Dairy',
    imageUrl: null,
  },
  {
    id: 'store-brand-peanut-butter',
    name: 'Creamy Peanut Butter',
    brand: 'Great Value',
    sizeQty: 16,
    sizeUnit: 'oz',
    upc: '078742999000',
    category: 'Pantry',
    imageUrl: null,
  },
  {
    id: 'store-brand-spaghetti',
    name: 'Spaghetti Pasta',
    brand: 'Good & Gather',
    sizeQty: 16,
    sizeUnit: 'oz',
    upc: '085239333444',
    category: 'Pantry',
    imageUrl: null,
  },
  {
    id: 'store-brand-tomato-sauce',
    name: 'Tomato Basil Pasta Sauce',
    brand: 'Great Value',
    sizeQty: 24,
    sizeUnit: 'oz',
    upc: '078742111333',
    category: 'Pantry',
    imageUrl: null,
  },
];

const basePrices: Omit<StorePrice, 'capturedAt'>[] = [
  { storeId: 'kroger-downtown-45202', productId: 'whole-milk-half-gallon', price: 5.49, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'whole-milk-half-gallon', price: 5.29, promoPrice: 4.79, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'whole-milk-half-gallon', price: 4.98, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'large-eggs-dozen', price: 4.29, promoPrice: 3.79, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'large-eggs-dozen', price: 3.99, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'large-eggs-dozen', price: 3.72, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'sandwich-bread', price: 3.49, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'sandwich-bread', price: 3.39, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'sandwich-bread', price: 2.98, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'bananas-bunch', price: 0.69, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'bananas-bunch', price: 0.59, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'bananas-bunch', price: 0.54, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'avocados-bag', price: 4.99, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'avocados-bag', price: 4.49, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'avocados-bag', price: 3.98, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'chicken-breast', price: 4.99, promoPrice: 3.99, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'chicken-breast', price: 5.49, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'chicken-breast', price: 4.28, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'ground-beef', price: 5.99, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'ground-beef', price: 6.29, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'ground-beef', price: 5.48, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'cheddar-shreds', price: 3.99, promoPrice: 2.99, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'cheddar-shreds', price: 3.49, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'cheddar-shreds', price: 3.22, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'greek-yogurt', price: 6.49, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'greek-yogurt', price: 6.29, promoPrice: 5.49, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'greek-yogurt', price: 5.98, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'peanut-butter', price: 3.79, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'peanut-butter', price: 3.59, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'peanut-butter', price: 3.12, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'spaghetti', price: 1.99, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'spaghetti', price: 1.89, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'spaghetti', price: 1.68, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'tomato-sauce', price: 8.99, promoPrice: 7.49, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'tomato-sauce', price: 8.69, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'tomato-sauce', price: 7.98, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'store-brand-milk-half-gallon', price: 3.99, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'store-brand-milk-half-gallon', price: 4.29, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'store-brand-milk-half-gallon', price: 3.82, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'store-brand-eggs-dozen', price: 3.29, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'store-brand-eggs-dozen', price: 3.49, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'store-brand-eggs-dozen', price: 3.12, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'store-brand-sandwich-bread', price: 2.69, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'store-brand-sandwich-bread', price: 2.79, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'store-brand-sandwich-bread', price: 2.44, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'market-bananas', price: 0.59, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'market-bananas', price: 0.55, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'market-bananas', price: 0.48, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'single-avocados', price: 4.49, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'single-avocados', price: 4.19, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'single-avocados', price: 3.58, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'store-brand-chicken-breast', price: 3.69, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'store-brand-chicken-breast', price: 4.59, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'store-brand-chicken-breast', price: 3.98, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'ground-turkey', price: 4.99, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'ground-turkey', price: 5.19, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'ground-turkey', price: 4.62, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'store-brand-cheddar-shreds', price: 2.79, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'store-brand-cheddar-shreds', price: 2.99, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'store-brand-cheddar-shreds', price: 2.48, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'store-brand-greek-yogurt', price: 4.99, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'store-brand-greek-yogurt', price: 4.79, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'store-brand-greek-yogurt', price: 4.42, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'store-brand-peanut-butter', price: 2.99, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'store-brand-peanut-butter', price: 2.89, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'store-brand-peanut-butter', price: 2.46, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'store-brand-spaghetti', price: 1.49, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'store-brand-spaghetti', price: 1.59, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'store-brand-spaghetti', price: 1.28, promoPrice: null, source: 'walmart' },
  { storeId: 'kroger-downtown-45202', productId: 'store-brand-tomato-sauce', price: 3.49, promoPrice: null, source: 'kroger' },
  { storeId: 'target-newport-45202', productId: 'store-brand-tomato-sauce', price: 3.69, promoPrice: null, source: 'target' },
  { storeId: 'walmart-fort-wright-45202', productId: 'store-brand-tomato-sauce', price: 2.98, promoPrice: null, source: 'walmart' },
];

const swapAlternatives: Record<string, { toProductId: string; reason: SwapSuggestion['reason'] }> = {
  'whole-milk-half-gallon': { toProductId: 'store-brand-milk-half-gallon', reason: 'cheaper-brand' },
  'large-eggs-dozen': { toProductId: 'store-brand-eggs-dozen', reason: 'cheaper-brand' },
  'sandwich-bread': { toProductId: 'store-brand-sandwich-bread', reason: 'cheaper-brand' },
  'bananas-bunch': { toProductId: 'market-bananas', reason: 'better-unit-price' },
  'avocados-bag': { toProductId: 'single-avocados', reason: 'better-unit-price' },
  'chicken-breast': { toProductId: 'store-brand-chicken-breast', reason: 'cheaper-brand' },
  'ground-beef': { toProductId: 'ground-turkey', reason: 'better-unit-price' },
  'cheddar-shreds': { toProductId: 'store-brand-cheddar-shreds', reason: 'cheaper-brand' },
  'greek-yogurt': { toProductId: 'store-brand-greek-yogurt', reason: 'cheaper-brand' },
  'peanut-butter': { toProductId: 'store-brand-peanut-butter', reason: 'cheaper-brand' },
  spaghetti: { toProductId: 'store-brand-spaghetti', reason: 'cheaper-brand' },
  'tomato-sauce': { toProductId: 'store-brand-tomato-sauce', reason: 'cheaper-brand' },
};

let mockCart: Cart | null = null;
let mockAlerts: PriceAlert[] = [
  {
    id: 'mock-alert-milk',
    productName: 'Whole Milk',
    storeName: 'Target Newport Pavilion',
    oldPrice: 5.29,
    newPrice: 4.79,
    capturedAt: hoursAgo(1),
    read: false,
  },
  {
    id: 'mock-alert-chicken',
    productName: 'Boneless Skinless Chicken Breast',
    storeName: 'Kroger Downtown Cincinnati',
    oldPrice: 4.99,
    newPrice: 3.99,
    capturedAt: hoursAgo(5),
    read: true,
  },
  {
    id: 'mock-alert-yogurt',
    productName: 'Plain Greek Yogurt',
    storeName: 'Target Newport Pavilion',
    oldPrice: 6.29,
    newPrice: 5.49,
    capturedAt: hoursAgo(28),
    read: true,
  },
];
let mockWatches: PriceWatch[] = [
  {
    id: 'mock-watch-eggs',
    productName: 'Large Brown Eggs',
    baselinePrice: 4.29,
    active: true,
    storeIds: ['kroger-downtown-45202', 'target-newport-45202', 'walmart-fort-wright-45202'],
  },
  {
    id: 'mock-watch-bread',
    productName: 'Soft Sandwich Bread',
    baselinePrice: 3.49,
    active: true,
    storeIds: ['kroger-downtown-45202', 'target-newport-45202'],
  },
  {
    id: 'mock-watch-avocados',
    productName: 'Hass Avocados',
    baselinePrice: 4.99,
    active: true,
    storeIds: ['kroger-downtown-45202', 'walmart-fort-wright-45202'],
  },
];

function effectivePrice(price: Omit<StorePrice, 'capturedAt'> | StorePrice) {
  return price.promoPrice ?? price.price;
}

function toMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getProduct(productId: string) {
  return mockProducts.find((product) => product.id === productId);
}

function createEmptyCart(): Cart {
  return {
    id: `mock-cart-${Date.now()}`,
    status: 'open',
    items: [],
  };
}

function ensureMockCart() {
  mockCart ??= createEmptyCart();
  return mockCart;
}

function cartResponse(cart: Cart) {
  return {
    cart: {
      ...cart,
      items: cart.items.map((item) => ({ ...item })),
    },
  };
}

export function getMockPrices(storeIds: string[]) {
  const selected = new Set(storeIds);
  return basePrices
    .filter((price) => selected.size === 0 || selected.has(price.storeId))
    .map((price, index) => ({ ...price, capturedAt: hoursAgo(2 + (index % 5)) }));
}

export function getMockStores() {
  return { stores: mockStores };
}

export function searchMockProducts(query: string, storeIds: string[]) {
  const needle = query.trim().toLowerCase();
  const prices = getMockPrices(storeIds);

  const products = mockProducts.filter((product) => {
    const haystack = [product.name, product.brand, product.category].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(needle);
  });

  return {
    results: products.map((product) => ({
      product,
      prices: prices.filter((price) => price.productId === product.id),
    })),
  };
}

export function getMockProductPrices(productId: string, storeIds: string[]) {
  const product = mockProducts.find((item) => item.id === productId) ?? mockProducts[0];
  const prices = getMockPrices(storeIds).filter((price) => price.productId === product.id);

  return { product, prices };
}

export function createMockCart() {
  mockCart = createEmptyCart();
  return cartResponse(mockCart);
}

export function getMockCurrentCart() {
  return cartResponse(ensureMockCart());
}

export function updateMockCartItem(productId: string, qty: number) {
  const product = getProduct(productId);
  if (!product) {
    throw new Error(`Unknown mock product ${productId}`);
  }

  const cart = ensureMockCart();
  if (cart.status === 'finalized') {
    mockCart = createEmptyCart();
  }

  const currentCart = ensureMockCart();
  const existingItem = currentCart.items.find((item) => item.productId === productId);
  const normalizedQty = Math.max(0, Math.floor(qty));

  if (normalizedQty === 0) {
    currentCart.items = currentCart.items.filter((item) => item.productId !== productId);
  } else if (existingItem) {
    existingItem.qty = normalizedQty;
  } else {
    currentCart.items = [...currentCart.items, { productId, qty: normalizedQty, product }];
  }

  currentCart.status = 'open';
  return cartResponse(currentCart);
}

export function finalizeMockCart(storeIds: string[]): CartOptimization {
  const cart = ensureMockCart();
  const selectedStoreIds = storeIds.length > 0 ? storeIds : mockStores.map((store) => store.id);
  const prices = getMockPrices(selectedStoreIds);
  const priceByProductStore = new Map(
    prices.map((price) => [`${price.productId}:${price.storeId}`, price]),
  );

  const perStoreTotals = selectedStoreIds.map((storeId) => {
    const missingItems: string[] = [];
    const total = cart.items.reduce((sum, item) => {
      const price = priceByProductStore.get(`${item.productId}:${storeId}`);
      if (!price) {
        missingItems.push(item.productId);
        return sum;
      }
      return sum + effectivePrice(price) * item.qty;
    }, 0);

    return { storeId, total: toMoney(total), missingItems };
  });

  const completeStoreTotals = perStoreTotals.filter((storeTotal) => storeTotal.missingItems.length === 0);
  const rankedStoreTotals = completeStoreTotals.length > 0 ? completeStoreTotals : perStoreTotals;
  const winningStore =
    [...rankedStoreTotals].sort((first, second) => first.total - second.total)[0] ??
    perStoreTotals[0] ??
    { storeId: selectedStoreIds[0] ?? mockStores[0].id, total: 0, missingItems: [] };
  const worstStore =
    [...rankedStoreTotals].sort((first, second) => second.total - first.total)[0] ?? winningStore;

  const cheaperElsewhere = cart.items.flatMap((item) => {
    const winningPrice = priceByProductStore.get(`${item.productId}:${winningStore.storeId}`);
    if (!winningPrice) {
      return [];
    }

    const cheapestOtherPrice = prices
      .filter((price) => price.productId === item.productId && price.storeId !== winningStore.storeId)
      .sort((first, second) => effectivePrice(first) - effectivePrice(second))[0];

    if (!cheapestOtherPrice || effectivePrice(cheapestOtherPrice) >= effectivePrice(winningPrice)) {
      return [];
    }

    return [
      {
        productId: item.productId,
        storeId: cheapestOtherPrice.storeId,
        price: toMoney(effectivePrice(cheapestOtherPrice)),
        delta: toMoney(effectivePrice(winningPrice) - effectivePrice(cheapestOtherPrice)),
      },
    ];
  });

  const swapSuggestions = cart.items.flatMap((item): SwapSuggestion[] => {
    const alternative = swapAlternatives[item.productId];
    if (!alternative) {
      return [];
    }

    const currentPrice = priceByProductStore.get(`${item.productId}:${winningStore.storeId}`);
    const alternativePrice = priceByProductStore.get(`${alternative.toProductId}:${winningStore.storeId}`);
    if (!currentPrice || !alternativePrice) {
      return [];
    }

    const savings = (effectivePrice(currentPrice) - effectivePrice(alternativePrice)) * item.qty;
    if (savings <= 0) {
      return [];
    }

    return [
      {
        fromProductId: item.productId,
        toProductId: alternative.toProductId,
        savings: toMoney(savings),
        reason: alternative.reason,
      },
    ];
  });

  const usedPrices = cart.items.flatMap((item) =>
    selectedStoreIds
      .map((storeId) => priceByProductStore.get(`${item.productId}:${storeId}`))
      .filter((price): price is StorePrice => Boolean(price)),
  );
  const pricesAsOf =
    usedPrices
      .map((price) => price.capturedAt)
      .sort((first, second) => new Date(first).getTime() - new Date(second).getTime())[0] ??
    hoursAgo(2);

  cart.status = 'finalized';

  return {
    winningStoreId: winningStore.storeId,
    winningTotal: winningStore.total,
    worstTotal: worstStore.total,
    savings: toMoney(Math.max(0, worstStore.total - winningStore.total)),
    perStoreTotals,
    cheaperElsewhere,
    swapSuggestions,
    pricesAsOf,
  };
}

export function registerMockPushToken() {
  return { ok: true } as const;
}

export function getMockAlerts() {
  return {
    alerts: mockAlerts.map((alert) => ({ ...alert })),
    watches: mockWatches.map((watch) => ({ ...watch, storeIds: [...watch.storeIds] })),
  };
}

export function markMockAlertRead(alertId: string) {
  mockAlerts = mockAlerts.map((alert) =>
    alert.id === alertId ? { ...alert, read: true } : alert,
  );

  const updatedAlert = mockAlerts.find((alert) => alert.id === alertId);
  if (!updatedAlert) {
    throw new Error(`Unknown mock alert ${alertId}`);
  }

  return { ...updatedAlert };
}

export function removeMockWatch(watchId: string) {
  mockWatches = mockWatches.filter((watch) => watch.id !== watchId);
  return { ok: true } as const;
}
