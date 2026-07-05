import type { CollectedProduct, CollectedStore, Collector } from "./types.js";
import type { CollectorHttp } from "./http.js";
import { createCollectorHttp, getRetryDelayMs, sleep } from "./http.js";
import { CollectorError } from "./types.js";

const KROGER_BASE_URL = "https://api.kroger.com";
const TOKEN_REFRESH_SKEW_MS = 60_000;
const NON_GROCERY_LOCATION_NAME_PATTERNS = [
  /\bfuel\b/i,
  /\bfuel center\b/i,
  /\bpharmacy\b/i,
  /\blittle clinic\b/i,
  /\bjewelers?\b/i,
  /\bspoke\b/i,
  /\bforecast\b/i,
  /\bshed\b/i,
  /\bwarehouse\b/i,
  /\bunused\b/i,
  /\btrans\b/i,
  /\bfulfillment\b/i,
  /\bdistribution\b/i,
];

interface KrogerCollectorOptions {
  clientId?: string;
  clientSecret?: string;
  fetch?: typeof fetch;
}

interface KrogerLocationResponse {
  data?: KrogerLocation[];
}

interface KrogerLocation {
  locationId?: unknown;
  name?: unknown;
  phone?: unknown;
  address?: {
    addressLine1?: unknown;
    city?: unknown;
    state?: unknown;
    zipCode?: unknown;
  };
  geolocation?: {
    latitude?: unknown;
    longitude?: unknown;
  };
  hours?: Record<string, unknown>;
}

interface KrogerProductResponse {
  data?: KrogerProduct[];
}

interface KrogerProduct {
  productId?: unknown;
  upc?: unknown;
  brand?: unknown;
  description?: unknown;
  categories?: unknown;
  images?: unknown;
  items?: Array<{
    size?: unknown;
    price?: {
      regular?: unknown;
      promo?: unknown;
    };
  }>;
}

export class KrogerCollector implements Collector {
  readonly chain = "kroger" as const;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly http: CollectorHttp;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor(options: KrogerCollectorOptions = {}) {
    this.clientId = options.clientId ?? process.env.KROGER_CLIENT_ID ?? "";
    this.clientSecret = options.clientSecret ?? process.env.KROGER_CLIENT_SECRET ?? "";
    this.fetchImpl = options.fetch ?? globalThis.fetch;

    if (!this.clientId || !this.clientSecret) {
      throw new Error("KrogerCollector requires KROGER_CLIENT_ID and KROGER_CLIENT_SECRET");
    }

    if (!this.fetchImpl) {
      throw new Error("KrogerCollector requires a fetch implementation");
    }

    this.http = createCollectorHttp({ chain: this.chain, fetch: this.fetchImpl });
  }

  async findStores(zip: string): Promise<CollectedStore[]> {
    const params = new URLSearchParams({
      "filter.zipCode.near": zip,
      "filter.limit": "10",
    });
    const payload = await this.request<KrogerLocationResponse>(`/v1/locations?${params}`);

    if (!Array.isArray(payload.data)) {
      throw new CollectorError(this.chain, "parse", "Kroger locations response missing data array");
    }

    return payload.data
      .filter(isCustomerFacingGroceryLocation)
      .map((location) => this.mapLocation(location));
  }

  async searchProducts(term: string, externalLocationId: string): Promise<CollectedProduct[]> {
    const params = new URLSearchParams({
      "filter.term": term,
      "filter.locationId": externalLocationId,
      "filter.limit": "20",
    });
    const payload = await this.request<KrogerProductResponse>(`/v1/products?${params}`);

    if (!Array.isArray(payload.data)) {
      throw new CollectorError(this.chain, "parse", "Kroger products response missing data array");
    }

    return this.mapProducts(payload.data);
  }

  async getPrices(
    externalProductIds: string[],
    externalLocationId: string,
  ): Promise<CollectedProduct[]> {
    if (externalProductIds.length === 0) {
      return [];
    }

    const params = new URLSearchParams({
      "filter.productId": externalProductIds.join(","),
      "filter.locationId": externalLocationId,
    });
    const payload = await this.request<KrogerProductResponse>(`/v1/products?${params}`);

    if (!Array.isArray(payload.data)) {
      throw new CollectorError(this.chain, "parse", "Kroger products response missing data array");
    }

    return this.mapProducts(payload.data);
  }

  private async request<T>(path: string, didRetryAuth = false, didRetryRateLimit = false): Promise<T> {
    const token = await this.getAccessToken();
    const response = await this.http.request(`${KROGER_BASE_URL}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      this.accessToken = null;
      this.tokenExpiresAt = 0;

      if (!didRetryAuth) {
        return this.request<T>(path, true, didRetryRateLimit);
      }

      throw new CollectorError(this.chain, "auth", "Kroger API rejected credentials");
    }

    if (response.status === 429) {
      if (!didRetryRateLimit) {
        const retryDelayMs = getRetryDelayMs(response.headers.get("retry-after"));
        if (retryDelayMs === null) {
          throw new CollectorError(this.chain, "rate-limit", "Kroger API rate limit exceeded");
        }

        await sleep(retryDelayMs);
        return this.request<T>(path, didRetryAuth, true);
      }

      throw new CollectorError(this.chain, "rate-limit", "Kroger API rate limit exceeded");
    }

    if (!response.ok) {
      throw new CollectorError(
        this.chain,
        "upstream",
        `Kroger API request failed with status ${response.status}`,
      );
    }

    return this.readJson<T>(response);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
      return this.accessToken;
    }

    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = this.refreshAccessToken().finally(() => {
      this.tokenRefreshPromise = null;
    });

    return this.tokenRefreshPromise;
  }

  private async refreshAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await this.http.request(`${KROGER_BASE_URL}/v1/connect/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "product.compact",
      }),
    });

    if (response.status === 401) {
      throw new CollectorError(this.chain, "auth", "Kroger token request rejected credentials");
    }

    if (response.status === 429) {
      throw new CollectorError(this.chain, "rate-limit", "Kroger token request rate limited");
    }

    if (!response.ok) {
      throw new CollectorError(
        this.chain,
        "upstream",
        `Kroger token request failed with status ${response.status}`,
      );
    }

    const payload = await this.readJson<{ access_token?: unknown; expires_in?: unknown }>(response);
    const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : null;

    if (!accessToken || !expiresIn) {
      throw new CollectorError(this.chain, "parse", "Kroger token response missing access token");
    }

    this.accessToken = accessToken;
    this.tokenExpiresAt = Date.now() + expiresIn * 1_000;

    return accessToken;
  }

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new CollectorError(this.chain, "parse", "Kroger API returned invalid JSON", {
        cause: error,
      });
    }
  }

  private mapLocation(location: KrogerLocation): CollectedStore {
    const externalLocationId = requiredString(location.locationId, "locationId");
    const name = requiredString(location.name, "name");
    const zip = requiredString(location.address?.zipCode, "address.zipCode");
    const latitude = requiredNumber(location.geolocation?.latitude, "geolocation.latitude");
    const longitude = requiredNumber(location.geolocation?.longitude, "geolocation.longitude");
    const addressParts = [
      optionalString(location.address?.addressLine1),
      optionalString(location.address?.city),
      optionalString(location.address?.state),
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

  private mapProducts(products: KrogerProduct[]): CollectedProduct[] {
    const capturedAt = new Date();

    return products.map((product) => {
      const item = product.items?.[0];
      const price = optionalPositiveNumber(item?.price?.regular);
      const promoPrice = price === null ? null : optionalPositiveNumber(item?.price?.promo);

      return {
        externalProductId: requiredString(product.productId, "productId"),
        name: requiredString(product.description, "description"),
        brand: optionalString(product.brand),
        sizeRaw: optionalString(item?.size),
        upc: optionalString(product.upc),
        category: firstString(product.categories),
        imageUrl: frontMediumImageUrl(product.images),
        price,
        promoPrice,
        capturedAt,
      };
    });
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CollectorError("kroger", "parse", `Kroger response missing ${field}`);
  }

  return value;
}

function isCustomerFacingGroceryLocation(location: KrogerLocation): boolean {
  const name = optionalString(location.name);

  if (!name) {
    return false;
  }

  if (NON_GROCERY_LOCATION_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
    return false;
  }

  const phone = optionalString(location.phone);
  if (phone === "9999999999") {
    return false;
  }

  return hasCustomerHours(location.hours);
}

function hasCustomerHours(hours: KrogerLocation["hours"]): boolean {
  if (!hours || typeof hours !== "object") {
    return false;
  }

  return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].some(
    (day) => {
      const dayHours = hours[day];
      return (
        dayHours !== null &&
        typeof dayHours === "object" &&
        ("open" in dayHours || "close" in dayHours || "open24" in dayHours)
      );
    },
  );
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CollectorError("kroger", "parse", `Kroger response missing ${field}`);
  }

  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalPositiveNumber(value: unknown): number | null {
  const numberValue = optionalNumber(value);
  return numberValue !== null && numberValue > 0 ? numberValue : null;
}

function firstString(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.find((item): item is string => typeof item === "string" && item.length > 0) ?? null;
}

function frontMediumImageUrl(images: unknown): string | null {
  if (!Array.isArray(images)) {
    return null;
  }

  for (const image of images) {
    if (!isObject(image) || image.perspective !== "front" || !Array.isArray(image.sizes)) {
      continue;
    }

    const medium = image.sizes.find(
      (size: unknown) => isObject(size) && size.size === "medium" && typeof size.url === "string",
    );

    if (isObject(medium) && typeof medium.url === "string") {
      return medium.url;
    }
  }

  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
