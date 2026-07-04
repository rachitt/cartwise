/** Core Cartwise domain types shared between the mobile app and the Price API. */

export type ChainSlug = "kroger" | "target" | "walmart" | "aldi";

export interface Store {
  id: string;
  chain: ChainSlug;
  name: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
  /** Straight-line distance from the user's ZIP centroid, miles. */
  distanceMiles?: number;
}

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  /** e.g. 12, with sizeUnit "oz" */
  sizeQty: number | null;
  sizeUnit: string | null;
  upc: string | null;
  category: string | null;
  imageUrl: string | null;
}

export interface StorePrice {
  storeId: string;
  productId: string;
  price: number;
  promoPrice: number | null;
  /** ISO timestamp of when this price was collected. Always shown in UI as "as of". */
  capturedAt: string;
  source: ChainSlug;
}

export interface CartItemInput {
  productId: string;
  qty: number;
}

export interface CheaperElsewhereFlag {
  productId: string;
  storeId: string;
  price: number;
  /** How much cheaper than at the winning store, per unit. */
  delta: number;
}

export interface SwapSuggestion {
  fromProductId: string;
  toProductId: string;
  /** Savings at the winning store if the swap is accepted. */
  savings: number;
  reason: "cheaper-brand" | "better-unit-price";
}

export interface CartOptimization {
  /** Cheapest single store for the whole cart. */
  winningStoreId: string;
  winningTotal: number;
  /** Total at the most expensive candidate store — the savings baseline. */
  worstTotal: number;
  /** worstTotal - winningTotal; the headline number shown to the user. */
  savings: number;
  perStoreTotals: Array<{ storeId: string; total: number; missingItems: string[] }>;
  cheaperElsewhere: CheaperElsewhereFlag[];
  swapSuggestions: SwapSuggestion[];
  /** Oldest capturedAt among prices used — drives the freshness stamp. */
  pricesAsOf: string;
}
