import type { Product, Store, StorePrice } from '@cartwise/shared';

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
];

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
