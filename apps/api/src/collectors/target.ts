import type { CollectedProduct, CollectedStore, Collector } from "./types.js";
import { CollectorError } from "./types.js";

const TARGET_BASE_URL = "https://redsky.target.com/redsky_aggregations/v1/web";
const DEFAULT_TARGET_API_KEY = "9f36aeafbe60771e321a7cc95a78140772ab3e96";
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 250;
const TARGET_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface TargetCollectorOptions {
  apiKey?: string;
  fetch?: typeof fetch;
}

interface TargetNearbyStoresResponse {
  data?: {
    nearby_stores?: {
      stores?: TargetStore[];
    };
  };
}

interface TargetStore {
  store_id?: unknown;
  location_id?: unknown;
  location_name?: unknown;
  name?: unknown;
  mailing_address?: {
    address_line1?: unknown;
    address_line_1?: unknown;
    city?: unknown;
    region?: unknown;
    state?: unknown;
    postal_code?: unknown;
    zip_code?: unknown;
  };
  address?: {
    address_line1?: unknown;
    address_line_1?: unknown;
    city?: unknown;
    region?: unknown;
    state?: unknown;
    postal_code?: unknown;
    zip_code?: unknown;
  };
  geographic_specifications?: {
    latitude?: unknown;
    longitude?: unknown;
  };
  geolocation?: {
    latitude?: unknown;
    longitude?: unknown;
  };
}

interface TargetSearchResponse {
  data?: {
    search?: {
      products?: TargetProduct[];
    };
  };
}

interface TargetProductResponse {
  data?: {
    product?: TargetProduct;
  };
}

interface TargetProduct {
  tcin?: unknown;
  item?: {
    product_description?: {
      title?: unknown;
    };
    primary_brand?: {
      name?: unknown;
    };
    enrichment?: {
      images?: {
        primary_image_url?: unknown;
      };
    };
    package_dimensions?: {
      weight?: unknown;
    };
  };
  price?: {
    current_retail?: unknown;
    reg_retail?: unknown;
  };
}

export class TargetCollector implements Collector {
  readonly chain = "target" as const;

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TargetCollectorOptions = {}) {
    this.apiKey = options.apiKey || process.env.TARGET_API_KEY || DEFAULT_TARGET_API_KEY;
    this.fetchImpl = options.fetch ?? globalThis.fetch;

    if (!this.apiKey) {
      throw new CollectorError(this.chain, "auth", "Target RedSky API key is not configured");
    }

    if (!this.fetchImpl) {
      throw new Error("TargetCollector requires a fetch implementation");
    }
  }

  async findStores(zip: string): Promise<CollectedStore[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      limit: "10",
      within: "20",
      place: zip,
      channel: "WEB",
    });
    const payload = await this.request<TargetNearbyStoresResponse>(`/nearby_stores_v1?${params}`);
    const stores = payload.data?.nearby_stores?.stores;

    if (!Array.isArray(stores)) {
      throw new CollectorError(this.chain, "parse", "Target stores response missing stores array");
    }

    return stores.map((store) => this.mapStore(store));
  }

  async searchProducts(term: string, externalLocationId: string): Promise<CollectedProduct[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      keyword: term,
      count: "20",
      offset: "0",
      pricing_store_id: externalLocationId,
      channel: "WEB",
    });
    const payload = await this.request<TargetSearchResponse>(`/plp_search_v2?${params}`);
    const products = payload.data?.search?.products;

    if (!Array.isArray(products)) {
      throw new CollectorError(this.chain, "parse", "Target search response missing products array");
    }

    return this.mapProducts(products);
  }

  async getPrices(
    externalProductIds: string[],
    externalLocationId: string,
  ): Promise<CollectedProduct[]> {
    if (externalProductIds.length === 0) {
      return [];
    }

    const batches: TargetProduct[][] = [];
    for (let index = 0; index < externalProductIds.length; index += 5) {
      const batchIds = externalProductIds.slice(index, index + 5);
      const batchProducts = await Promise.all(
        batchIds.map((externalProductId) => this.getProduct(externalProductId, externalLocationId)),
      );
      batches.push(batchProducts.filter((product): product is TargetProduct => product !== null));
    }

    return this.mapProducts(batches.flat());
  }

  private async getProduct(
    externalProductId: string,
    externalLocationId: string,
  ): Promise<TargetProduct | null> {
    const params = new URLSearchParams({
      key: this.apiKey,
      tcin: externalProductId,
      pricing_store_id: externalLocationId,
    });
    const payload = await this.request<TargetProductResponse | null>(`/pdp_client_v1?${params}`, {
      allowNotFound: true,
    });

    if (payload === null) {
      return null;
    }

    const product = payload.data?.product;
    if (!product) {
      throw new CollectorError(this.chain, "parse", "Target product response missing product");
    }

    return product;
  }

  private async request<T>(
    path: string,
    options: { allowNotFound?: boolean } = {},
    didRetryRateLimit = false,
  ): Promise<T> {
    const response = await this.fetchImpl(`${TARGET_BASE_URL}${path}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": TARGET_USER_AGENT,
      },
    });

    if (response.status === 404 && options.allowNotFound) {
      return null as T;
    }

    if (response.status === 429) {
      if (!didRetryRateLimit) {
        await sleep(getRetryDelayMs(response.headers.get("retry-after")));
        return this.request<T>(path, options, true);
      }

      throw new CollectorError(this.chain, "rate-limit", "Target RedSky API rate limit exceeded");
    }

    if (!response.ok) {
      throw new CollectorError(
        this.chain,
        "upstream",
        `Target RedSky API request failed with status ${response.status}`,
      );
    }

    return this.readJson<T>(response);
  }

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new CollectorError(this.chain, "parse", "Target RedSky API returned invalid JSON", {
        cause: error,
      });
    }
  }

  private mapStore(store: TargetStore): CollectedStore {
    const externalLocationId = requiredString(
      firstPresent(store.store_id, store.location_id),
      "store_id",
    );
    const name = requiredString(firstPresent(store.location_name, store.name), "location_name");
    const address = store.mailing_address ?? store.address;
    const zip = requiredString(
      firstPresent(address?.postal_code, address?.zip_code),
      "mailing_address.postal_code",
    );
    const latitude = requiredNumber(
      firstPresent(
        store.geographic_specifications?.latitude,
        store.geolocation?.latitude,
      ),
      "geographic_specifications.latitude",
    );
    const longitude = requiredNumber(
      firstPresent(
        store.geographic_specifications?.longitude,
        store.geolocation?.longitude,
      ),
      "geographic_specifications.longitude",
    );
    const addressLine = optionalString(firstPresent(address?.address_line1, address?.address_line_1));
    const region = optionalString(firstPresent(address?.region, address?.state));
    const addressParts = [
      addressLine,
      optionalString(address?.city),
      region,
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

  private mapProducts(products: TargetProduct[]): CollectedProduct[] {
    const capturedAt = new Date();

    return products.map((product) => {
      const name = decodeHtml(requiredString(product.item?.product_description?.title, "title"));
      const { price, promoPrice } = mapPrice(product.price);

      return {
        externalProductId: requiredString(product.tcin, "tcin"),
        name,
        brand: optionalString(product.item?.primary_brand?.name),
        sizeRaw: sizeFromTitle(name) ?? sizeFromWeight(product.item?.package_dimensions?.weight),
        upc: null,
        category: null,
        imageUrl: optionalString(product.item?.enrichment?.images?.primary_image_url),
        price,
        promoPrice,
        capturedAt,
      };
    });
  }
}

function mapPrice(price: TargetProduct["price"]): { price: number | null; promoPrice: number | null } {
  const currentRetail = optionalNumber(price?.current_retail);
  const regularRetail = optionalNumber(price?.reg_retail);

  if (currentRetail === null) {
    return { price: null, promoPrice: null };
  }

  if (regularRetail !== null && currentRetail < regularRetail) {
    return { price: regularRetail, promoPrice: currentRetail };
  }

  return { price: currentRetail, promoPrice: null };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CollectorError("target", "parse", `Target response missing ${field}`);
  }

  return value;
}

function requiredNumber(value: unknown, field: string): number {
  const numberValue = typeof value === "string" ? Number(value) : value;

  if (typeof numberValue !== "number" || !Number.isFinite(numberValue)) {
    throw new CollectorError("target", "parse", `Target response missing ${field}`);
  }

  return numberValue;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

function firstPresent(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function sizeFromTitle(title: string): string | null {
  const match = title.match(
    /(?:^|[\s(-])(\d+(?:\.\d+)?)\s*(fl\s*oz|floz|oz|ounce|ounces|ct|count|counts|lb|lbs|pound|pounds|g|gram|grams|ml|milliliter|milliliters|l|liter|liters|gal|gallon|gallons)\.?\)?$/i,
  );

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return `${match[1]} ${match[2].toLowerCase().replace(/\s+/g, " ")}`;
}

function sizeFromWeight(weight: unknown): string | null {
  if (typeof weight === "string" && weight.length > 0) {
    return weight;
  }

  if (typeof weight === "number" && Number.isFinite(weight)) {
    return String(weight);
  }

  if (!isObject(weight)) {
    return null;
  }

  const value = optionalNumber(firstPresent(weight.value, weight.weight));
  const unit = optionalString(firstPresent(weight.unit_of_measurement, weight.unit, weight.weight_unit));

  if (value === null) {
    return null;
  }

  return unit ? `${value} ${unit}` : String(value);
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
      const normalized = entity.toLowerCase();

      if (normalized.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
      }

      if (normalized.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
      }

      const namedEntities: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
      };

      return namedEntities[normalized] ?? `&${entity};`;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRetryDelayMs(retryAfter: string | null): number {
  if (!retryAfter) {
    return DEFAULT_RATE_LIMIT_BACKOFF_MS;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }

  return DEFAULT_RATE_LIMIT_BACKOFF_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
