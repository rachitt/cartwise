import { createSign, randomUUID } from "node:crypto";

import type { CollectedProduct, CollectedStore, Collector } from "./types.js";
import { CollectorError } from "./types.js";

const DEFAULT_BASE_URL = "https://developer.api.walmart.com/api-proxy/service/affil/product/v2";
const DEFAULT_KEY_VERSION = "1";

interface WalmartCollectorOptions {
  consumerId?: string;
  privateKey?: string;
  keyVersion?: string;
  publisherId?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

interface WalmartStoreResponse {
  stores?: unknown;
  results?: unknown;
}

interface WalmartSearchResponse {
  items?: unknown;
  results?: unknown;
}

interface WalmartItemResponse {
  item?: unknown;
}

type WalmartObject = Record<string, unknown>;

export class WalmartCollector implements Collector {
  readonly chain = "walmart" as const;

  private readonly consumerId: string;
  private readonly privateKey: string;
  private readonly keyVersion: string;
  private readonly publisherId: string | null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: WalmartCollectorOptions = {}) {
    this.consumerId = options.consumerId ?? process.env.WALMART_CONSUMER_ID ?? "";
    this.privateKey = normalizePrivateKey(
      options.privateKey ?? process.env.WALMART_PRIVATE_KEY ?? "",
    );
    this.keyVersion =
      options.keyVersion ?? process.env.WALMART_KEY_VERSION ?? DEFAULT_KEY_VERSION;
    this.publisherId = nonEmptyString(options.publisherId ?? process.env.WALMART_PUBLISHER_ID);
    this.baseUrl = trimTrailingSlash(
      options.baseUrl ?? process.env.WALMART_API_BASE_URL ?? DEFAULT_BASE_URL,
    );
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;

    if (!this.consumerId || !this.privateKey) {
      throw new Error("WalmartCollector requires WALMART_CONSUMER_ID and WALMART_PRIVATE_KEY");
    }

    if (!this.fetchImpl) {
      throw new Error("WalmartCollector requires a fetch implementation");
    }
  }

  async findStores(zip: string): Promise<CollectedStore[]> {
    const payload = await this.request<WalmartStoreResponse>("/stores", {
      zipCode: zip,
    });
    const stores = firstArray(payload.stores, payload.results);

    if (!stores) {
      throw new CollectorError(this.chain, "parse", "Walmart stores response missing stores array");
    }

    return stores.map((store) => this.mapStore(asObject(store)));
  }

  async searchProducts(term: string, externalLocationId: string): Promise<CollectedProduct[]> {
    const payload = await this.request<WalmartSearchResponse>("/search", {
      query: term,
      storeId: externalLocationId,
    });
    const products = firstArray(payload.items, payload.results);

    if (!products) {
      throw new CollectorError(this.chain, "parse", "Walmart search response missing items array");
    }

    return this.mapProducts(products.map(asObject));
  }

  async getPrices(
    externalProductIds: string[],
    externalLocationId: string,
  ): Promise<CollectedProduct[]> {
    const products: WalmartObject[] = [];

    for (const externalProductId of externalProductIds) {
      const product = await this.getProduct(externalProductId, externalLocationId);
      if (product) {
        products.push(product);
      }
    }

    return this.mapProducts(products);
  }

  private async getProduct(
    externalProductId: string,
    externalLocationId: string,
  ): Promise<WalmartObject | null> {
    const payload = await this.request<WalmartItemResponse | WalmartObject>(
      `/items/${encodeURIComponent(externalProductId)}`,
      { storeId: externalLocationId },
      { allowNotFound: true },
    );

    if (payload === null) {
      return null;
    }

    return asObject("item" in payload ? payload.item : payload);
  }

  private async request<T>(
    path: string,
    query: Record<string, string>,
    options: { allowNotFound?: boolean } = {},
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const response = await this.fetchImpl(url, {
      headers: this.authHeaders(),
    });

    if (response.status === 404 && options.allowNotFound) {
      return null as T;
    }

    if (response.status === 401 || response.status === 403) {
      throw new CollectorError(
        this.chain,
        "auth",
        `Walmart API rejected credentials with status ${response.status}`,
      );
    }

    if (response.status === 429) {
      throw new CollectorError(this.chain, "rate-limit", "Walmart API rate limit exceeded");
    }

    if (!response.ok) {
      throw new CollectorError(
        this.chain,
        "upstream",
        `Walmart API request failed with status ${response.status}`,
      );
    }

    return this.readJson<T>(response);
  }

  private buildUrl(path: string, query: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    if (this.publisherId) {
      url.searchParams.set("publisherId", this.publisherId);
    }

    return url.toString();
  }

  private authHeaders(): Record<string, string> {
    const timestamp = String(this.now());
    const signaturePayload = `${this.consumerId}\n${timestamp}\n${this.keyVersion}\n`;
    const signer = createSign("RSA-SHA256");
    signer.update(signaturePayload);
    signer.end();

    return {
      Accept: "application/json",
      "WM_CONSUMER.ID": this.consumerId,
      "WM_CONSUMER.INTIMESTAMP": timestamp,
      "WM_SEC.KEY_VERSION": this.keyVersion,
      "WM_SEC.AUTH_SIGNATURE": signer.sign(this.privateKey, "base64"),
      "WM_QOS.CORRELATION_ID": randomUUID(),
    };
  }

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new CollectorError(this.chain, "parse", "Walmart API returned invalid JSON", {
        cause: error,
      });
    }
  }

  private mapStore(store: WalmartObject): CollectedStore {
    const address = asObject(firstPresent(store.address, store.physicalAddress));
    const externalLocationId = requiredString(
      firstPresent(store.storeId, store.id, store.no),
      "storeId",
    );
    const name =
      optionalString(firstPresent(store.name, store.displayName, store.storeName)) ??
      `Walmart #${externalLocationId}`;
    const zip = requiredString(
      firstPresent(store.zipCode, store.zip, address.postalCode, address.zipCode, address.zip),
      "zipCode",
    );
    const latitude = requiredNumber(
      firstPresent(store.latitude, store.lat, asObject(store.geoPoint).latitude),
      "latitude",
    );
    const longitude = requiredNumber(
      firstPresent(store.longitude, store.lon, store.lng, asObject(store.geoPoint).longitude),
      "longitude",
    );
    const addressParts = [
      optionalString(
        firstPresent(store.streetAddress, store.addressLine1, address.streetAddress, address.address1),
      ),
      optionalString(firstPresent(store.city, address.city)),
      optionalString(firstPresent(store.state, address.state)),
      zip,
    ].filter((part): part is string => Boolean(part));

    return {
      externalLocationId,
      name,
      address: addressParts.join(", "),
      zip,
      lat: latitude,
      lng: longitude,
    };
  }

  private mapProducts(products: WalmartObject[]): CollectedProduct[] {
    const capturedAt = new Date();

    return products.map((product) => {
      const currentPrice = priceFromProduct(product);
      const comparisonPrice = optionalNumber(
        firstPresent(product.msrp, product.listPrice, product.wasPrice),
      );

      return {
        externalProductId: requiredString(
          firstPresent(product.itemId, product.usItemId, product.productId, product.id, product.sku),
          "itemId",
        ),
        name: requiredString(
          firstPresent(product.name, product.productName, product.title),
          "name",
        ),
        brand: optionalString(firstPresent(product.brandName, product.brand)),
        sizeRaw: optionalString(firstPresent(product.size, product.sizeRaw, product.variant)),
        upc: optionalString(firstPresent(product.upc, product.upcCode, product.gtin)),
        category: optionalString(
          firstPresent(product.categoryPath, product.categoryNode, product.category),
        ),
        imageUrl: optionalString(
          firstPresent(product.thumbnailImage, product.mediumImage, product.largeImage, product.imageUrl),
        ),
        price:
          comparisonPrice !== null && currentPrice !== null && comparisonPrice > currentPrice
            ? comparisonPrice
            : currentPrice,
        promoPrice:
          comparisonPrice !== null && currentPrice !== null && comparisonPrice > currentPrice
            ? currentPrice
            : null,
        capturedAt,
      };
    });
  }
}

function priceFromProduct(product: WalmartObject): number | null {
  const currentPrice = firstPresent(product.salePrice, product.price, product.currentPrice);

  if (typeof currentPrice === "object" && currentPrice !== null) {
    return optionalNumber(
      firstPresent(
        (currentPrice as WalmartObject).price,
        (currentPrice as WalmartObject).amount,
        (currentPrice as WalmartObject).value,
      ),
    );
  }

  return optionalNumber(currentPrice);
}

function requiredString(value: unknown, field: string): string {
  const stringValue = optionalString(value);

  if (!stringValue) {
    throw new CollectorError("walmart", "parse", `Walmart response missing ${field}`);
  }

  return stringValue;
}

function requiredNumber(value: unknown, field: string): number {
  const numberValue = optionalNumber(value);

  if (numberValue === null) {
    throw new CollectorError("walmart", "parse", `Walmart response missing ${field}`);
  }

  return numberValue;
}

function optionalString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstArray(...values: unknown[]): unknown[] | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function firstPresent(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function asObject(value: unknown): WalmartObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as WalmartObject : {};
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
