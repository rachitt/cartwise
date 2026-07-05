import type { CollectedProduct, CollectedStore, Collector } from "./types.js";
import type { CollectorHttp } from "./http.js";
import { createCollectorHttp } from "./http.js";
import { CollectorError } from "./types.js";

const DEFAULT_BASE_URL = "https://www.aldi.us";
const STOREFRONT_PATH = "/store/aldi/storefront";
const GRAPHQL_PATH = "/graphql";
const USER_AGENT = "Mozilla/5.0";
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1_000;
const OPERATION_HASH_CHUNK_ID = "51488";
const DEFAULT_OPERATION_HASHES = {
  GetRetailerLocationAddress: "b80a5ef08c6fe88df0b9a2e78a099dd6141345b213df0f9f517803674b6eee94",
  ItemPricesQuery: "3077743e0ab9f6d3210a7c415c541591ec84b4d90a44df76f7f047e115dc8e54",
  Items: "9ad66078d7fa81276b6bd4eb6a6f6fcdd1f4022ff0c3f5b4663c62877f06692a",
  Search: "775d628502396ec608b292911723b045bf5ebba2f2c02c04536e4887c365b1a2",
} as const;

type AldiOperationName = keyof typeof DEFAULT_OPERATION_HASHES;

interface AldiCollectorOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

interface AldiApolloState {
  CreateImplicitGuestUser?: Record<string, AldiGuestUserEntry>;
  GetLastUserLocation?: Record<string, AldiLastUserLocationEntry>;
  GetRetailerLocationAddress?: Record<string, AldiRetailerLocationEntry>;
  Shop?: Record<string, AldiShopEntry>;
  ShopCollectionScoped?: Record<string, AldiShopCollectionEntry>;
  ShopCollectionUnscoped?: Record<string, AldiShopCollectionEntry>;
}

interface AldiGuestUserEntry {
  createImplicitGuestUser?: {
    authToken?: {
      token?: unknown;
      expires?: unknown;
    };
  };
}

interface AldiLastUserLocationEntry {
  lastUserLocation?: {
    postalCode?: unknown;
    zoneId?: unknown;
    coordinates?: {
      latitude?: unknown;
      longitude?: unknown;
    };
  };
}

interface AldiShopEntry {
  shop?: AldiShop;
}

interface AldiShopCollectionEntry {
  shops?: AldiShop[];
}

interface AldiShop {
  id?: unknown;
  retailerLocationId?: unknown;
  serviceType?: unknown;
}

interface AldiRetailerLocationEntry {
  retailerLocation?: AldiRetailerLocation;
}

interface AldiRetailerLocation {
  id?: unknown;
  coordinates?: {
    latitude?: unknown;
    longitude?: unknown;
  };
  viewSection?: {
    address?: {
      lineOneString?: unknown;
      lineTwoString?: unknown;
    };
    locationDisplayNameString?: unknown;
  };
}

interface AldiSession {
  token: string;
  expiresAt: number;
  postalCode: string;
  zoneId: string;
  shops: AldiShopContext[];
  locations: Map<string, AldiRetailerLocation>;
}

interface AldiShopContext {
  retailerLocationId: string;
  shopId: string;
  serviceType: string;
  postalCode: string;
  zoneId: string;
}

interface AldiGraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message?: string }>;
}

interface AldiSearchData {
  searchResults?: {
    primaryItemResultList?: {
      items?: AldiItem[];
      itemIds?: string[];
    };
  };
}

interface AldiItemsData {
  items?: AldiItem[];
}

interface AldiItemPricesData {
  itemPrices?: AldiPrice[];
}

interface AldiLocationData {
  retailerLocation?: AldiRetailerLocation;
}

interface AldiItem {
  id?: unknown;
  name?: unknown;
  size?: unknown;
  productId?: unknown;
  brandName?: unknown;
  availability?: {
    available?: unknown;
  };
  price?: AldiPrice | null;
  viewSection?: {
    itemImage?: {
      url?: unknown;
      templateUrl?: unknown;
    };
  };
}

interface AldiPrice {
  id?: unknown;
  itemId?: unknown;
  viewSection?: {
    itemCard?: {
      priceString?: unknown;
      fullPriceString?: unknown;
      plainFullPriceString?: unknown;
      pricingUnitString?: unknown;
    };
  };
}

export class AldiCollector implements Collector {
  readonly chain = "aldi" as const;

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly http: CollectorHttp;
  private readonly now: () => number;
  private readonly sessions = new Map<string, AldiSession>();
  private readonly sessionRefreshPromises = new Map<string, Promise<AldiSession>>();
  private readonly operationHashes = new Map<string, string>(
    Object.entries(DEFAULT_OPERATION_HASHES),
  );

  constructor(options: AldiCollectorOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;

    if (!this.fetchImpl) {
      throw new Error("AldiCollector requires a fetch implementation");
    }

    this.http = createCollectorHttp({
      chain: this.chain,
      fetch: this.fetchImpl,
      now: this.now,
      headers: { "User-Agent": USER_AGENT },
    });
  }

  async findStores(zip: string): Promise<CollectedStore[]> {
    const session = await this.getSession(zip);
    const shops = selectPreferredShops(session.shops);
    const stores: CollectedStore[] = [];

    for (const shop of shops) {
      const location = await this.getLocation(shop.retailerLocationId, session);
      if (location) {
        stores.push(mapStore(shop, location));
      }
    }

    return stores;
  }

  async searchProducts(term: string, externalLocationId: string): Promise<CollectedProduct[]> {
    const context = parseExternalLocationId(externalLocationId);
    const session = await this.getSession(context.postalCode);
    const data = await this.requestGraphql<AldiSearchData>(
      "Search",
      {
        query: term,
        shopId: context.shopId,
        zoneId: context.zoneId,
        postalCode: context.postalCode,
      },
      session,
    );
    const items = data.searchResults?.primaryItemResultList?.items;

    if (!Array.isArray(items)) {
      throw new CollectorError(this.chain, "parse", "ALDI search response missing items array");
    }

    return mapItems(items, this.now);
  }

  async getPrices(
    externalProductIds: string[],
    externalLocationId: string,
  ): Promise<CollectedProduct[]> {
    if (externalProductIds.length === 0) {
      return [];
    }

    const context = parseExternalLocationId(externalLocationId);
    const session = await this.getSession(context.postalCode);
    const products: CollectedProduct[] = [];

    for (let index = 0; index < externalProductIds.length; index += 10) {
      const ids = externalProductIds.slice(index, index + 10);
      const itemsData = await this.requestGraphql<AldiItemsData>(
        "Items",
        {
          ids,
          shopId: context.shopId,
          zoneId: context.zoneId,
          postalCode: context.postalCode,
        },
        session,
      );
      const pricesData = await this.requestGraphql<AldiItemPricesData>(
        "ItemPricesQuery",
        {
          ids,
          shopId: context.shopId,
          zoneId: context.zoneId,
          postalCode: context.postalCode,
        },
        session,
      );

      const pricesByItemId = new Map(
        (pricesData.itemPrices ?? [])
          .map((price): [string, AldiPrice] | null => {
            const itemId = optionalString(price.itemId);
            return itemId ? [itemId, price] : null;
          })
          .filter((entry): entry is [string, AldiPrice] => entry !== null),
      );
      const items = itemsData.items ?? [];

      for (const item of items) {
        const itemId = optionalString(item.id);
        if (!itemId) {
          continue;
        }

        products.push(
          ...mapItems(
            [
              {
                ...item,
                price: pricesByItemId.get(itemId) ?? item.price,
              },
            ],
            this.now,
          ),
        );
      }
    }

    return products;
  }

  private async getSession(postalCode: string, forceRefresh = false): Promise<AldiSession> {
    const cached = this.sessions.get(postalCode);
    if (!forceRefresh && cached && this.now() < cached.expiresAt - TOKEN_REFRESH_SKEW_MS) {
      return cached;
    }

    const inFlightRefresh = this.sessionRefreshPromises.get(postalCode);
    if (inFlightRefresh) {
      return inFlightRefresh;
    }

    const refreshPromise = this.refreshSession(postalCode).finally(() => {
      this.sessionRefreshPromises.delete(postalCode);
    });
    this.sessionRefreshPromises.set(postalCode, refreshPromise);
    return refreshPromise;
  }

  private async refreshSession(postalCode: string): Promise<AldiSession> {
    const html = await this.fetchText(this.buildStorefrontUrl(postalCode));
    const session = parseSessionState(html, postalCode, this.now());
    this.sessions.set(postalCode, session);
    return session;
  }

  private async getLocation(
    retailerLocationId: string,
    session: AldiSession,
  ): Promise<AldiRetailerLocation | null> {
    const cached = session.locations.get(retailerLocationId);
    if (cached) {
      return cached;
    }

    const data = await this.requestGraphql<AldiLocationData>(
      "GetRetailerLocationAddress",
      { id: retailerLocationId },
      session,
    );
    const location = data.retailerLocation ?? null;

    if (location) {
      session.locations.set(retailerLocationId, location);
    }

    return location;
  }

  private async requestGraphql<TData>(
    operationName: AldiOperationName,
    variables: Record<string, unknown>,
    session: AldiSession,
    didRefreshHashes = false,
    didRefreshSession = false,
  ): Promise<TData> {
    const operationHash = this.operationHashes.get(operationName);
    if (!operationHash) {
      throw new CollectorError(this.chain, "auth", `ALDI operation hash missing for ${operationName}`);
    }

    const url = new URL(GRAPHQL_PATH, this.baseUrl);
    url.searchParams.set("operationName", operationName);
    url.searchParams.set("variables", JSON.stringify(variables));
    url.searchParams.set(
      "extensions",
      JSON.stringify({ persistedQuery: { version: 1, sha256Hash: operationHash } }),
    );

    const response = await this.http.request(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.token}`,
        Referer: this.buildStorefrontUrl(session.postalCode),
        "User-Agent": USER_AGENT,
      },
    });

    if (response.status === 401 || response.status === 403) {
      if (!didRefreshSession) {
        const refreshedSession = await this.getSession(session.postalCode, true);
        replaceSession(session, refreshedSession);
        return this.requestGraphql<TData>(
          operationName,
          variables,
          session,
          didRefreshHashes,
          true,
        );
      }

      throw new CollectorError(this.chain, "auth", "ALDI GraphQL rejected guest session");
    }

    if (response.status === 202) {
      throw new CollectorError(this.chain, "auth", "ALDI GraphQL returned bot-control challenge");
    }

    if (response.status === 429) {
      throw new CollectorError(this.chain, "rate-limit", "ALDI GraphQL rate limit exceeded");
    }

    if (!response.ok) {
      throw new CollectorError(
        this.chain,
        "upstream",
        `ALDI GraphQL request failed with status ${response.status}`,
      );
    }

    const payload = await readJson<AldiGraphqlResponse<TData>>(response, this.chain);
    if (payload.errors?.length) {
      const message = payload.errors
        .map((error) => error.message)
        .filter((errorMessage): errorMessage is string => Boolean(errorMessage))
        .join("; ");

      if (/persisted query/i.test(message) && !didRefreshHashes) {
        await this.refreshOperationHashes();
        return this.requestGraphql<TData>(
          operationName,
          variables,
          session,
          true,
          didRefreshSession,
        );
      }

      if (/not authenticated/i.test(message)) {
        if (!didRefreshSession) {
          const refreshedSession = await this.getSession(session.postalCode, true);
          replaceSession(session, refreshedSession);
          return this.requestGraphql<TData>(
            operationName,
            variables,
            session,
            didRefreshHashes,
            true,
          );
        }

        throw new CollectorError(this.chain, "auth", "ALDI GraphQL rejected guest session");
      }

      throw new CollectorError(this.chain, "upstream", `ALDI GraphQL error: ${message}`);
    }

    if (!payload.data) {
      throw new CollectorError(this.chain, "parse", "ALDI GraphQL response missing data");
    }

    return payload.data;
  }

  private async refreshOperationHashes(): Promise<void> {
    const html = await this.fetchText(this.buildStorefrontUrl("07030"));
    const runtimeSrc = extractRuntimeScriptSrc(html);
    const runtimeText = await this.fetchText(runtimeSrc);
    const { names, hashes } = parseRuntimeChunkMaps(runtimeText);
    const operationChunkHash = hashes[OPERATION_HASH_CHUNK_ID];
    const operationChunkName = names[OPERATION_HASH_CHUNK_ID] ?? OPERATION_HASH_CHUNK_ID;

    if (!operationChunkHash) {
      throw new CollectorError(this.chain, "auth", "ALDI operation hash chunk was not found");
    }

    const operationChunkUrl = new URL(
      `${operationChunkName}-${operationChunkHash}-v3.webpack_chunk.js`,
      runtimeSrc,
    ).toString();
    const operationChunkText = await this.fetchText(operationChunkUrl);
    const hashesByOperation = parseOperationHashChunk(operationChunkText);

    for (const operationName of Object.keys(DEFAULT_OPERATION_HASHES)) {
      const hash = hashesByOperation[operationName];
      if (hash) {
        this.operationHashes.set(operationName, hash);
      }
    }
  }

  private async fetchText(url: string): Promise<string> {
    const response = await this.http.request(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/javascript,application/json",
        "User-Agent": USER_AGENT,
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new CollectorError(this.chain, "auth", "ALDI storefront request rejected");
    }

    if (response.status === 429) {
      throw new CollectorError(this.chain, "rate-limit", "ALDI storefront rate limit exceeded");
    }

    if (!response.ok) {
      throw new CollectorError(
        this.chain,
        "upstream",
        `ALDI storefront request failed with status ${response.status}`,
      );
    }

    try {
      return await response.text();
    } catch (error) {
      throw new CollectorError(this.chain, "parse", "ALDI storefront response was unreadable", {
        cause: error,
      });
    }
  }

  private buildStorefrontUrl(postalCode: string): string {
    const url = new URL(STOREFRONT_PATH, this.baseUrl);
    url.searchParams.set("zipcode", postalCode);
    return url.toString();
  }
}

function parseSessionState(html: string, requestedPostalCode: string, now: number): AldiSession {
  const state = extractApolloState(html);
  const guestUser = firstEntry(state.CreateImplicitGuestUser)?.createImplicitGuestUser;
  const token = requiredString(guestUser?.authToken?.token, "CreateImplicitGuestUser.authToken.token");
  const expiresAt = parseExpiresAt(guestUser?.authToken?.expires, now);
  const userLocation = state.GetLastUserLocation?.["{}"]?.lastUserLocation;
  const postalCode = optionalString(userLocation?.postalCode) ?? requestedPostalCode;
  const zoneId = requiredString(userLocation?.zoneId, "GetLastUserLocation.zoneId");
  const shops = extractShops(state).map((shop) => ({
    retailerLocationId: requiredString(shop.retailerLocationId, "shop.retailerLocationId"),
    shopId: requiredString(shop.id, "shop.id"),
    serviceType: optionalString(shop.serviceType) ?? "unknown",
    postalCode,
    zoneId,
  }));
  const locations = new Map<string, AldiRetailerLocation>();

  for (const entry of Object.values(state.GetRetailerLocationAddress ?? {})) {
    const location = entry.retailerLocation;
    const locationId = optionalString(location?.id);
    if (location && locationId) {
      locations.set(locationId, location);
    }
  }

  return {
    token,
    expiresAt,
    postalCode,
    zoneId,
    shops,
    locations,
  };
}

function extractApolloState(html: string): AldiApolloState {
  const match = html.match(
    /<script id="node-apollo-state" type="application\/json">([\s\S]*?)<\/script>/,
  );

  if (!match) {
    throw new CollectorError("aldi", "parse", "ALDI storefront missing Apollo state");
  }

  const raw = decodeHtmlEntities(match[1] ?? "");
  const decoded = /^[%][0-9A-Fa-f]{2}/.test(raw) ? decodeURIComponent(raw) : raw;

  try {
    return JSON.parse(decoded) as AldiApolloState;
  } catch (error) {
    throw new CollectorError("aldi", "parse", "ALDI storefront returned invalid Apollo state", {
      cause: error,
    });
  }
}

function extractShops(state: AldiApolloState): AldiShop[] {
  const shopsById = new Map<string, AldiShop>();

  for (const entry of Object.values(state.Shop ?? {})) {
    const shop = entry.shop;
    const shopId = optionalString(shop?.id);
    if (shop && shopId) {
      shopsById.set(shopId, shop);
    }
  }

  for (const collection of [
    ...Object.values(state.ShopCollectionScoped ?? {}),
    ...Object.values(state.ShopCollectionUnscoped ?? {}),
  ]) {
    for (const shop of collection.shops ?? []) {
      const shopId = optionalString(shop.id);
      if (shopId && !shopsById.has(shopId)) {
        shopsById.set(shopId, shop);
      }
    }
  }

  return [...shopsById.values()];
}

function selectPreferredShops(shops: AldiShopContext[]): AldiShopContext[] {
  const byLocation = new Map<string, AldiShopContext>();

  for (const shop of shops) {
    const existing = byLocation.get(shop.retailerLocationId);
    if (!existing || serviceRank(shop.serviceType) < serviceRank(existing.serviceType)) {
      byLocation.set(shop.retailerLocationId, shop);
    }
  }

  return [...byLocation.values()];
}

function serviceRank(serviceType: string): number {
  if (serviceType === "delivery") {
    return 0;
  }

  if (serviceType === "pickup") {
    return 1;
  }

  if (serviceType === "instore") {
    return 2;
  }

  return 3;
}

function mapStore(shop: AldiShopContext, location: AldiRetailerLocation): CollectedStore {
  const locationName = requiredString(
    location.viewSection?.locationDisplayNameString,
    "retailerLocation.viewSection.locationDisplayNameString",
  );
  const lineOne = requiredString(
    location.viewSection?.address?.lineOneString,
    "retailerLocation.viewSection.address.lineOneString",
  );
  const lineTwo = requiredString(
    location.viewSection?.address?.lineTwoString,
    "retailerLocation.viewSection.address.lineTwoString",
  );
  const latitude = requiredNumber(
    location.coordinates?.latitude,
    "retailerLocation.coordinates.latitude",
  );
  const longitude = requiredNumber(
    location.coordinates?.longitude,
    "retailerLocation.coordinates.longitude",
  );

  return {
    externalLocationId: encodeExternalLocationId(shop),
    name: locationName,
    address: [lineOne, lineTwo].join(", "),
    zip: parseZip(lineTwo),
    lat: latitude,
    lng: longitude,
  };
}

function mapItems(items: AldiItem[], now: () => number): CollectedProduct[] {
  const capturedAt = new Date(now());
  const products: CollectedProduct[] = [];

  for (const item of items) {
    if (item.availability?.available === false) {
      continue;
    }

    const externalProductId = optionalString(item.id);
    const name = optionalString(item.name);
    if (!externalProductId || !name) {
      continue;
    }

    const price = mapPrice(item.price ?? null);
    products.push({
      externalProductId,
      name,
      brand: optionalString(item.brandName),
      sizeRaw: optionalString(item.size),
      upc: null,
      category: null,
      imageUrl:
        optionalString(item.viewSection?.itemImage?.url) ??
        optionalString(item.viewSection?.itemImage?.templateUrl),
      price: price.price,
      promoPrice: price.promoPrice,
      capturedAt,
    });
  }

  return products;
}

function mapPrice(price: AldiPrice | null): { price: number | null; promoPrice: number | null } {
  const itemCard = price?.viewSection?.itemCard;
  const currentPrice = parseMoney(itemCard?.priceString);
  const fullPrice = parseMoney(itemCard?.plainFullPriceString) ?? parseMoney(itemCard?.fullPriceString);

  if (currentPrice === null) {
    return { price: fullPrice, promoPrice: null };
  }

  if (fullPrice !== null && fullPrice > currentPrice) {
    return { price: fullPrice, promoPrice: currentPrice };
  }

  return { price: currentPrice, promoPrice: null };
}

function replaceSession(target: AldiSession, source: AldiSession): void {
  target.token = source.token;
  target.expiresAt = source.expiresAt;
  target.postalCode = source.postalCode;
  target.zoneId = source.zoneId;
  target.shops = source.shops;
  target.locations = source.locations;
}

function encodeExternalLocationId(context: AldiShopContext): string {
  return [
    context.retailerLocationId,
    context.shopId,
    context.zoneId,
    context.postalCode,
  ].join(":");
}

function parseExternalLocationId(externalLocationId: string): AldiShopContext {
  const [retailerLocationId, shopId, zoneId, postalCode] = externalLocationId.split(":");

  if (!retailerLocationId || !shopId || !zoneId || !postalCode) {
    throw new CollectorError("aldi", "parse", "ALDI location id is malformed");
  }

  return {
    retailerLocationId,
    shopId,
    zoneId,
    postalCode,
    serviceType: "unknown",
  };
}

async function readJson<T>(response: Response, chain: "aldi"): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new CollectorError(chain, "parse", "ALDI response returned invalid JSON", {
      cause: error,
    });
  }
}

function parseRuntimeChunkMaps(runtimeText: string): {
  names: Record<string, string>;
  hashes: Record<string, string>;
} {
  const resolverStart = runtimeText.indexOf("l.u=e=>");
  const namesStart = runtimeText.indexOf("(({", resolverStart);

  if (resolverStart === -1 || namesStart === -1) {
    throw new CollectorError("aldi", "parse", "ALDI runtime chunk map was not found");
  }

  const namesObject = extractObjectText(runtimeText, namesStart);
  const hashesObject = extractObjectText(runtimeText, namesObject.end);

  return {
    names: parseNumericStringMap(namesObject.text),
    hashes: parseNumericStringMap(hashesObject.text),
  };
}

function extractObjectText(source: string, startAt: number): { text: string; end: number } {
  const objectStart = source.indexOf("{", startAt);

  if (objectStart === -1) {
    throw new CollectorError("aldi", "parse", "ALDI runtime object was not found");
  }

  let depth = 0;
  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return { text: source.slice(objectStart, index + 1), end: index + 1 };
      }
    }
  }

  throw new CollectorError("aldi", "parse", "ALDI runtime object was not closed");
}

function parseNumericStringMap(objectText: string): Record<string, string> {
  try {
    return JSON.parse(objectText.replace(/([{,])(\d+):/g, '$1"$2":')) as Record<string, string>;
  } catch (error) {
    throw new CollectorError("aldi", "parse", "ALDI runtime chunk map was invalid", {
      cause: error,
    });
  }
}

function parseOperationHashChunk(chunkText: string): Record<string, string> {
  const match = chunkText.match(/JSON\.parse\('([\s\S]*?)'\)\}/);

  if (!match) {
    throw new CollectorError("aldi", "parse", "ALDI operation hash chunk was invalid");
  }

  try {
    return JSON.parse((match[1] ?? "").replace(/\\'/g, "'")) as Record<string, string>;
  } catch (error) {
    throw new CollectorError("aldi", "parse", "ALDI operation hash payload was invalid", {
      cause: error,
    });
  }
}

function extractRuntimeScriptSrc(html: string): string {
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1] ?? "");
  const runtimeSrc = scripts.find((script) => /runtime\.webpack_bundle/.test(script));

  if (!runtimeSrc) {
    throw new CollectorError("aldi", "parse", "ALDI runtime script was not found");
  }

  return runtimeSrc;
}

function firstEntry<T>(record: Record<string, T> | undefined): T | undefined {
  return record ? Object.values(record)[0] : undefined;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseExpiresAt(value: unknown, now: number): number {
  const expires = optionalString(value);
  const parsed = expires ? Date.parse(expires) : NaN;

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return now + DEFAULT_SESSION_TTL_MS;
}

function parseZip(value: string): string {
  return value.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] ?? value;
}

function parseMoney(value: unknown): number | null {
  let parsed: number;

  if (typeof value === "number" && Number.isFinite(value)) {
    parsed = value;
  } else if (typeof value === "string") {
    const match = value.match(/\$(-?[0-9]+(?:\.[0-9]{1,2})?)/);
    if (!match) {
      return null;
    }

    parsed = Number(match[1]);
  } else {
    return null;
  }

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function requiredString(value: unknown, field: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new CollectorError("aldi", "parse", `ALDI response missing ${field}`);
  }

  return stringValue;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CollectorError("aldi", "parse", `ALDI response missing ${field}`);
  }

  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
