import { randomBytes } from "node:crypto";

import type { CollectedProduct, CollectedStore, Collector } from "./types.js";
import type { CollectorHttp } from "./http.js";
import { createCollectorHttp, getRetryDelayMs, sleep } from "./http.js";
import { CollectorError } from "./types.js";

const TARGET_HOME_URL = "https://www.target.com/";
const TARGET_API_PLATFORM_BASE_URL = "https://api.target.com";
const TARGET_CDUI_BASE_URL = "https://cdui-orchestrations.target.com";
const DEFAULT_TARGET_API_KEY = "9f36aeafbe60771e321a7cc95a78140772ab3e96";
const WEB_KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const TARGET_VISITOR_ID = randomBytes(16).toString("hex").toUpperCase();
const TARGET_USER_AGENT = "Mozilla/5.0";
const TARGET_SEARCH_COUNT = 24;
const TARGET_PRICE_LOOKUP_CONCURRENCY = 2;
const WEB_KEY_REGEXES = [
  /"apiKey":"([a-f0-9]{40})"/,
  /key=([a-f0-9]{40})/,
  /"key":"([a-f0-9]{40})"/,
];

let cachedWebKey: string | null = null;
let cachedWebKeyExpiresAt = 0;
let webKeyRefreshPromise: Promise<string> | null = null;

interface TargetCollectorOptions {
  apiKey?: string;
  fetch?: typeof fetch;
}

interface TargetPreferredStoresResponse {
  preferred_stores?: TargetPreferredStore[];
}

interface TargetPreferredStore {
  location_id?: unknown;
  location_names?: TargetLocationName[];
}

interface TargetLocationName {
  name_type?: unknown;
  name?: unknown;
}

interface TargetPublicLocation {
  location_id?: unknown;
  store_id?: unknown;
  location_name?: unknown;
  name?: unknown;
  location_names?: TargetLocationName[];
  mailing_address?: TargetAddress;
  address?: TargetAddress | TargetAddress[];
  geographic_specifications?: {
    latitude?: unknown;
    longitude?: unknown;
    iso_time_zone_code?: unknown;
    time_zone_code?: unknown;
  };
  geofence?: {
    latitude?: unknown;
    longitude?: unknown;
  };
  geolocation?: {
    latitude?: unknown;
    longitude?: unknown;
  };
  capabilities?: TargetCapability[];
}

interface TargetAddress {
  address_context_code?: unknown;
  address_line1?: unknown;
  address_line_1?: unknown;
  city?: unknown;
  region?: unknown;
  state?: unknown;
  postal_code?: unknown;
  zip_code?: unknown;
}

interface TargetCapability {
  capability_code?: unknown;
  capability_name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

interface TargetCduiSearchResponse {
  data_source_modules?: Array<{
    module_data?: {
      search_response?: {
        products?: TargetProduct[];
      };
    };
  }>;
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
      image_info?: {
        primary_image?: {
          url?: unknown;
        };
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

  private readonly configuredApiKey: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly http: CollectorHttp;
  private readonly locationCache = new Map<string, TargetPublicLocation>();

  constructor(options: TargetCollectorOptions = {}) {
    this.configuredApiKey =
      nonEmptyString(options.apiKey) ?? nonEmptyString(process.env.TARGET_API_KEY);
    this.fetchImpl = options.fetch ?? globalThis.fetch;

    if (!this.fetchImpl) {
      throw new Error("TargetCollector requires a fetch implementation");
    }

    this.http = createCollectorHttp({
      chain: this.chain,
      fetch: this.fetchImpl,
      headers: { "User-Agent": TARGET_USER_AGENT },
    });
  }

  async findStores(zip: string): Promise<CollectedStore[]> {
    const payload = await this.requestWithApiKey<TargetPreferredStoresResponse>((apiKey) =>
      buildUrl(`${TARGET_API_PLATFORM_BASE_URL}/location_fulfillment_aggregations/v1/preferred_stores`, {
        key: apiKey,
        zipcode: zip,
      }),
    );
    const stores = payload.preferred_stores;

    if (!Array.isArray(stores)) {
      throw new CollectorError(
        this.chain,
        "parse",
        "Target preferred stores response missing stores array",
      );
    }

    const mappedStores: CollectedStore[] = [];
    for (const store of stores.slice(0, 10)) {
      const externalLocationId = requiredString(store.location_id, "location_id");
      const hydratedStore = await this.getStoreLocation(externalLocationId);
      if (isGroceryStore(hydratedStore)) {
        mappedStores.push(this.mapStore(hydratedStore));
      }
    }

    return mappedStores;
  }

  async searchProducts(term: string, externalLocationId: string): Promise<CollectedProduct[]> {
    const store = await this.getStoreLocation(externalLocationId);
    const payload = await this.searchCdui(term, store);

    return this.mapProducts(readSearchProducts(payload));
  }

  async getPrices(
    externalProductIds: string[],
    externalLocationId: string,
  ): Promise<CollectedProduct[]> {
    if (externalProductIds.length === 0) {
      return [];
    }

    const store = await this.getStoreLocation(externalLocationId);
    const products = await mapWithConcurrency(
      externalProductIds,
      TARGET_PRICE_LOOKUP_CONCURRENCY,
      async (externalProductId) => {
        const payload = await this.searchCdui(externalProductId, store);
        return readSearchProducts(payload).find(
          (product) => optionalString(product.tcin) === externalProductId,
        ) ?? null;
      },
    );

    return this.mapProducts(
      products.filter((product): product is TargetProduct => product !== null),
    );
  }

  private async getStoreLocation(externalLocationId: string): Promise<TargetPublicLocation> {
    const cached = this.locationCache.get(externalLocationId);
    if (cached) {
      return cached;
    }

    const store = await this.requestWithApiKey<TargetPublicLocation>((apiKey) =>
      buildUrl(
        `${TARGET_API_PLATFORM_BASE_URL}/locations/v3/public/${encodeURIComponent(externalLocationId)}`,
        { key: apiKey },
      ),
    );

    this.locationCache.set(externalLocationId, store);
    return store;
  }

  private async searchCdui(
    term: string,
    store: TargetPublicLocation,
  ): Promise<TargetCduiSearchResponse> {
    const externalLocationId = this.readStoreId(store);
    const address = readStoreAddress(store);
    const zip = requiredString(
      firstPresent(address?.postal_code, address?.zip_code),
      "address.postal_code",
    );
    const region = requiredString(firstPresent(address?.region, address?.state), "address.region");
    const latitude = readLatitude(store);
    const longitude = readLongitude(store);
    const page = targetSearchPage(term);
    const searchTerm = term.trim().replace(/\s+/g, " ");

    return this.requestWithApiKey<TargetCduiSearchResponse>((apiKey) =>
      buildUrl(`${TARGET_CDUI_BASE_URL}/cdui_orchestrations/v1/pages/slp`, {
        key: apiKey,
        platform: "WEB",
        privacy_do_not_sell: "false",
        targeted_advertising_opt_out: "false",
        device_type: "desktop",
        sapphire_channel: "WEB",
        sapphire_page: page,
        channel: "WEB",
        page,
        visitor_id: TARGET_VISITOR_ID,
        purchasable_store_ids: externalLocationId,
        latitude: String(latitude),
        longitude: String(longitude),
        scheduled_delivery_store_id: externalLocationId,
        scheduled_delivery_zip_code: firstFiveZip(zip),
        state: region,
        store_id: externalLocationId,
        zip: firstFiveZip(zip),
        has_pending_inputs: "false",
        count: String(TARGET_SEARCH_COUNT),
        default_purchasability_filter: "true",
        include_sponsored: "false",
        new_search: "true",
        offset: "0",
        spellcheck: "true",
        store_ids: externalLocationId,
        keyword: searchTerm,
        is_seo_bot: "false",
        include_data_source_modules: "true",
        query_string: `searchTerm=${searchTerm}`,
        timezone: optionalString(store.geographic_specifications?.iso_time_zone_code) ?? "America/New_York",
      }),
    );
  }

  private async requestWithApiKey<T>(
    buildRequestUrl: (apiKey: string) => string,
    didRetryRateLimit = false,
    didRetryAuth = false,
  ): Promise<T> {
    const apiKey = didRetryAuth
      ? await resolveWebKey(this.fetchImpl, { forceRefresh: true })
      : await this.resolveApiKey();
    const response = await this.http.request(buildRequestUrl(apiKey), {
      headers: {
        Accept: "application/json",
        "User-Agent": TARGET_USER_AGENT,
      },
    });

    if (response.status === 429) {
      if (!didRetryRateLimit) {
        const retryDelayMs = getRetryDelayMs(response.headers.get("retry-after"));
        if (retryDelayMs === null) {
          throw new CollectorError(this.chain, "rate-limit", "Target API rate limit exceeded");
        }

        await sleep(retryDelayMs);
        return this.requestWithApiKey<T>(buildRequestUrl, true, didRetryAuth);
      }

      throw new CollectorError(this.chain, "rate-limit", "Target API rate limit exceeded");
    }

    if (response.status === 401 || response.status === 403) {
      if (didRetryAuth) {
        throw new CollectorError(this.chain, "auth", "Target API authentication failed");
      }

      invalidateTargetWebKeyCache();
      return this.requestWithApiKey<T>(buildRequestUrl, didRetryRateLimit, true);
    }

    if (!response.ok) {
      throw new CollectorError(
        this.chain,
        "upstream",
        `Target API request failed with status ${response.status}`,
      );
    }

    return this.readJson<T>(response);
  }

  private async resolveApiKey(): Promise<string> {
    if (this.configuredApiKey) {
      return this.configuredApiKey;
    }

    try {
      return await resolveWebKey(this.fetchImpl);
    } catch {
      if (DEFAULT_TARGET_API_KEY) {
        return DEFAULT_TARGET_API_KEY;
      }

      throw new CollectorError(this.chain, "auth", "Target API key is not configured");
    }
  }

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new CollectorError(this.chain, "parse", "Target API returned invalid JSON", {
        cause: error,
      });
    }
  }

  private readStoreId(store: TargetPublicLocation): string {
    return requiredString(firstPresent(store.location_id, store.store_id), "location_id");
  }

  private mapStore(store: TargetPublicLocation): CollectedStore {
    const externalLocationId = this.readStoreId(store);
    const name = requiredString(
      firstPresent(readLocationName(store.location_names), store.location_name, store.name),
      "location_name",
    );
    const address = readStoreAddress(store);
    const zip = requiredString(
      firstPresent(address?.postal_code, address?.zip_code),
      "address.postal_code",
    );
    const latitude = readLatitude(store);
    const longitude = readLongitude(store);
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
        imageUrl: optionalString(
          firstPresent(
            product.item?.enrichment?.images?.primary_image_url,
            product.item?.enrichment?.image_info?.primary_image?.url,
          ),
        ),
        price,
        promoPrice,
        capturedAt,
      };
    });
  }
}

export async function resolveWebKey(
  fetchImpl: typeof fetch = globalThis.fetch,
  options: { forceRefresh?: boolean } = {},
): Promise<string> {
  if (!fetchImpl) {
    throw new CollectorError("target", "auth", "Target web key fetch requires fetch");
  }

  if (!options.forceRefresh) {
    const cached = getCachedWebKey();
    if (cached) {
      return cached;
    }
  }

  if (webKeyRefreshPromise) {
    return webKeyRefreshPromise;
  }

  webKeyRefreshPromise = fetchTargetWebKey(fetchImpl).finally(() => {
    webKeyRefreshPromise = null;
  });

  return webKeyRefreshPromise;
}

async function fetchTargetWebKey(fetchImpl: typeof fetch): Promise<string> {
  const http = createCollectorHttp({
    chain: "target",
    fetch: fetchImpl,
    headers: { "User-Agent": TARGET_USER_AGENT },
  });
  let response: Response;

  try {
    response = await http.request(TARGET_HOME_URL, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "User-Agent": TARGET_USER_AGENT,
      },
    });
  } catch (error) {
    throw new CollectorError("target", "auth", "Target web key fetch failed", { cause: error });
  }

  if (!response.ok) {
    throw new CollectorError(
      "target",
      "auth",
      `Target web key fetch failed with status ${response.status}`,
    );
  }

  let html: string;
  try {
    html = await response.text();
  } catch (error) {
    throw new CollectorError("target", "parse", "Target web key response was unreadable", {
      cause: error,
    });
  }

  for (const regex of WEB_KEY_REGEXES) {
    const key = html.match(regex)?.[1];

    if (key) {
      cachedWebKey = key;
      cachedWebKeyExpiresAt = Date.now() + WEB_KEY_CACHE_TTL_MS;
      return key;
    }
  }

  throw new CollectorError("target", "auth", "Target web key was not found");
}

export function invalidateTargetWebKeyCache(): void {
  cachedWebKey = null;
  cachedWebKeyExpiresAt = 0;
}

function getCachedWebKey(): string | null {
  return cachedWebKey && cachedWebKeyExpiresAt > Date.now() ? cachedWebKey : null;
}

function mapPrice(price: TargetProduct["price"]): { price: number | null; promoPrice: number | null } {
  const currentRetail = optionalPositiveNumber(price?.current_retail);
  const regularRetail = optionalPositiveNumber(price?.reg_retail);

  if (currentRetail === null) {
    return { price: null, promoPrice: null };
  }

  if (regularRetail !== null && currentRetail < regularRetail) {
    return { price: regularRetail, promoPrice: currentRetail };
  }

  return { price: currentRetail, promoPrice: null };
}

function readSearchProducts(payload: TargetCduiSearchResponse): TargetProduct[] {
  for (const module of payload.data_source_modules ?? []) {
    const products = module.module_data?.search_response?.products;

    if (Array.isArray(products)) {
      return products;
    }
  }

  throw new CollectorError("target", "parse", "Target search response missing products array");
}

function readStoreAddress(store: TargetPublicLocation): TargetAddress {
  if (Array.isArray(store.address)) {
    const mailingAddress =
      store.address.find(
        (address) => optionalString(address.address_context_code)?.toLowerCase() === "m",
      ) ?? store.address[0];

    if (mailingAddress) {
      return mailingAddress;
    }
  }

  if (store.address && !Array.isArray(store.address)) {
    return store.address;
  }

  if (store.mailing_address) {
    return store.mailing_address;
  }

  throw new CollectorError("target", "parse", "Target response missing address");
}

function readLocationName(locationNames: TargetLocationName[] | undefined): string | null {
  if (!Array.isArray(locationNames)) {
    return null;
  }

  const projectName =
    locationNames.find(
      (locationName) => optionalString(locationName.name_type)?.toLowerCase() === "proj name",
    ) ?? locationNames[0];

  return optionalString(projectName?.name);
}

function readLatitude(store: TargetPublicLocation): number {
  return requiredNumber(
    firstPresent(
      store.geographic_specifications?.latitude,
      store.geofence?.latitude,
      store.geolocation?.latitude,
      readCapabilityCoordinate(store, "latitude"),
    ),
    "geographic_specifications.latitude",
  );
}

function readLongitude(store: TargetPublicLocation): number {
  return requiredNumber(
    firstPresent(
      store.geographic_specifications?.longitude,
      store.geofence?.longitude,
      store.geolocation?.longitude,
      readCapabilityCoordinate(store, "longitude"),
    ),
    "geographic_specifications.longitude",
  );
}

function readCapabilityCoordinate(
  store: TargetPublicLocation,
  coordinate: "latitude" | "longitude",
): unknown {
  return store.capabilities?.find((capability) => capability[coordinate] !== undefined)?.[
    coordinate
  ];
}

function isGroceryStore(store: TargetPublicLocation): boolean {
  if (!Array.isArray(store.capabilities)) {
    return true;
  }

  return store.capabilities.some((capability) => {
    const code = optionalString(capability.capability_code)?.toLowerCase() ?? "";
    const name = optionalString(capability.capability_name)?.toLowerCase() ?? "";

    return code.includes("grocery") || name.includes("grocery");
  });
}

function targetSearchPage(term: string): string {
  return `/s/${term.trim().replace(/\s+/g, " ")}`;
}

function buildUrl(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function requiredString(value: unknown, field: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

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

function nonEmptyString(value: unknown): string | null {
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

function optionalPositiveNumber(value: unknown): number | null {
  const numberValue = optionalNumber(value);
  return numberValue !== null && numberValue > 0 ? numberValue : null;
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function firstPresent(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function firstFiveZip(zip: string): string {
  return zip.match(/\d{5}/)?.[0] ?? zip;
}

function sizeFromTitle(title: string): string | null {
  const match = title.match(
    /(?:^|[\s(-])(\d+(?:\.\d+)?)\s*(fl\s*oz|floz|oz|ounce|ounces|ct|count|counts|lb|lbs|pound|pounds|g|gram|grams|ml|milliliter|milliliters|l|liter|liters|gal|gallon|gallons)\.?\)?(?:\s|$)/i,
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
