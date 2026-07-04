import type { ChainSlug } from "@cartwise/shared";

export interface CollectedStore {
  externalLocationId: string;
  name: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
}

export interface CollectedProduct {
  externalProductId: string;
  name: string;
  brand: string | null;
  sizeRaw: string | null;
  upc: string | null;
  category: string | null;
  imageUrl: string | null;
  price: number | null;
  promoPrice: number | null;
  capturedAt: Date;
}

export interface Collector {
  chain: ChainSlug;
  findStores(zip: string): Promise<CollectedStore[]>;
  searchProducts(term: string, externalLocationId: string): Promise<CollectedProduct[]>;
  getPrices(externalProductIds: string[], externalLocationId: string): Promise<CollectedProduct[]>;
}

export type CollectorErrorKind = "auth" | "rate-limit" | "upstream" | "parse";

export class CollectorError extends Error {
  constructor(
    public readonly chain: ChainSlug,
    public readonly kind: CollectorErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CollectorError";
  }
}
