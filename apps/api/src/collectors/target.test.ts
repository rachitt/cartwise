import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCollector } from "./registry.js";
import { invalidateTargetWebKeyCache, resolveWebKey, TargetCollector } from "./target.js";

describe("TargetCollector", () => {
  const originalTargetApiKey = process.env.TARGET_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateTargetWebKeyCache();
    delete process.env.TARGET_API_KEY;
  });

  afterEach(() => {
    vi.useRealTimers();
    invalidateTargetWebKeyCache();

    if (originalTargetApiKey === undefined) {
      delete process.env.TARGET_API_KEY;
    } else {
      process.env.TARGET_API_KEY = originalTargetApiKey;
    }
  });

  it.each([
    ["apiKey property", `"apiKey":"${"a".repeat(40)}"`, "a".repeat(40)],
    [
      "query key",
      `https://redsky.target.com/path?key=${"b".repeat(40)}&channel=WEB`,
      "b".repeat(40),
    ],
    ["key property", `"key":"${"c".repeat(40)}"`, "c".repeat(40)],
  ])("extracts web key from %s fixture HTML", async (_name, html, expectedKey) => {
    const fetchMock = queuedFetch([htmlResponse(`<html><script>${html}</script></html>`)]);

    await expect(resolveWebKey(fetchMock, { forceRefresh: true })).resolves.toBe(expectedKey);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://www.target.com/");
  });

  it("maps nearby stores from preferred stores and public location details", async () => {
    const fetchMock = queuedFetch([
      jsonResponse(targetPreferredStores(["1092"])),
      jsonResponse(
        targetLocation({
          id: "1092",
          name: "Cincinnati Oakley",
          addressLine: "3245 Geier Dr",
          city: "Cincinnati",
          region: "OH",
          zip: "45209",
          lat: 39.1532,
          lng: -84.427,
        }),
      ),
    ]);
    const collector = new TargetCollector({ apiKey: "test-key", fetch: fetchMock });

    await expect(collector.findStores("45202")).resolves.toEqual([
      {
        externalLocationId: "1092",
        name: "Cincinnati Oakley",
        address: "3245 Geier Dr, Cincinnati, OH, 45209",
        zip: "45209",
        lat: 39.1532,
        lng: -84.427,
      },
    ]);

    const preferredStoresUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(preferredStoresUrl.hostname).toBe("api.target.com");
    expect(preferredStoresUrl.pathname).toBe(
      "/location_fulfillment_aggregations/v1/preferred_stores",
    );
    expect(preferredStoresUrl.searchParams.get("key")).toBe("test-key");
    expect(preferredStoresUrl.searchParams.get("zipcode")).toBe("45202");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: "application/json",
    });

    const locationUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(locationUrl.hostname).toBe("api.target.com");
    expect(locationUrl.pathname).toBe("/locations/v3/public/1092");
    expect(locationUrl.searchParams.get("key")).toBe("test-key");
  });

  it("uses capability coordinates when public location coordinates are missing", async () => {
    const fetchMock = queuedFetch([
      jsonResponse(targetPreferredStores(["1092"])),
      jsonResponse(
        targetLocation({
          id: "1092",
          name: "Beechmont Area",
          addressLine: "8680 Beechmont Ave",
          city: "Cincinnati",
          region: "OH",
          zip: "45255-4710",
          lat: null,
          lng: null,
          capabilities: [
            { capability_name: "Fresh Grocery", latitude: 39.073405, longitude: -84.313929 },
          ],
        }),
      ),
    ]);
    const collector = new TargetCollector({ apiKey: "test-key", fetch: fetchMock });

    await expect(collector.findStores("45202")).resolves.toEqual([
      {
        externalLocationId: "1092",
        name: "Beechmont Area",
        address: "8680 Beechmont Ave, Cincinnati, OH, 45255-4710",
        zip: "45255-4710",
        lat: 39.073405,
        lng: -84.313929,
      },
    ]);
  });

  it("filters Target locations that do not offer groceries", async () => {
    const fetchMock = queuedFetch([
      jsonResponse(targetPreferredStores(["1", "2"])),
      jsonResponse(
        targetLocation({
          id: "1",
          name: "Fresh Target",
          addressLine: "1 Main St",
          city: "Cincinnati",
          region: "OH",
          zip: "45202",
          lat: 39.1,
          lng: -84.5,
          capabilities: [{ capability_code: "Fresh Grocery" }],
        }),
      ),
      jsonResponse(
        targetLocation({
          id: "2",
          name: "Optical Only Target",
          addressLine: "2 Main St",
          city: "Cincinnati",
          region: "OH",
          zip: "45202",
          lat: 39.2,
          lng: -84.6,
          capabilities: [{ capability_name: "Target Optical" }],
        }),
      ),
    ]);
    const collector = new TargetCollector({ apiKey: "test-key", fetch: fetchMock });

    await expect(collector.findStores("45202")).resolves.toEqual([
      {
        externalLocationId: "1",
        name: "Fresh Target",
        address: "1 Main St, Cincinnati, OH, 45202",
        zip: "45202",
        lat: 39.1,
        lng: -84.5,
      },
    ]);
  });

  it("maps CDUI product search results including sale, regular, and missing prices", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const fetchMock = queuedFetch([
      jsonResponse(targetLocation({ id: "1092" })),
      jsonResponse(
        targetCduiResponse([
          targetProduct({
            tcin: "12953453",
            title: "Good &amp; Gather Sparkling Water 12oz",
            brand: "Good & Gather",
            imageUrl: "https://target.scene7.com/is/image/Target/GUEST_sale",
            currentRetail: 2.99,
            regularRetail: 3.49,
          }),
          targetProduct({
            tcin: "13264003",
            title: "Market Pantry Bread 20 oz",
            brand: "Market Pantry",
            imageUrl: "https://target.scene7.com/is/image/Target/GUEST_regular",
            currentRetail: 1.99,
            regularRetail: 1.99,
          }),
          targetProduct({
            tcin: "54561123",
            title: "Bananas",
            brand: "Chiquita",
          }),
        ]),
      ),
    ]);
    const collector = new TargetCollector({ apiKey: "test-key", fetch: fetchMock });

    await expect(collector.searchProducts("water", "1092")).resolves.toEqual([
      {
        externalProductId: "12953453",
        name: "Good & Gather Sparkling Water 12oz",
        brand: "Good & Gather",
        sizeRaw: "12 oz",
        upc: null,
        category: null,
        imageUrl: "https://target.scene7.com/is/image/Target/GUEST_sale",
        price: 3.49,
        promoPrice: 2.99,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
      {
        externalProductId: "13264003",
        name: "Market Pantry Bread 20 oz",
        brand: "Market Pantry",
        sizeRaw: "20 oz",
        upc: null,
        category: null,
        imageUrl: "https://target.scene7.com/is/image/Target/GUEST_regular",
        price: 1.99,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
      {
        externalProductId: "54561123",
        name: "Bananas",
        brand: "Chiquita",
        sizeRaw: null,
        upc: null,
        category: null,
        imageUrl: null,
        price: null,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
    ]);

    const url = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(url.hostname).toBe("cdui-orchestrations.target.com");
    expect(url.pathname).toBe("/cdui_orchestrations/v1/pages/slp");
    expect(url.searchParams.get("keyword")).toBe("water");
    expect(url.searchParams.get("count")).toBe("24");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("page")).toBe("/s/water");
    expect(url.searchParams.get("store_id")).toBe("1092");
    expect(url.searchParams.get("scheduled_delivery_zip_code")).toBe("45209");
    expect(url.searchParams.get("channel")).toBe("WEB");
    expect(url.searchParams.get("visitor_id")).toMatch(/^[A-F0-9]{32}$/);
  });

  it("maps exact TCIN price lookups and skips missing products", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const fetchMock = queuedFetch([
      jsonResponse(targetLocation({ id: "1092" })),
      jsonResponse(
        targetCduiResponse([
          targetProduct({
            tcin: "12953453",
            title: "Good & Gather Sparkling Water 12oz",
            brand: "Good & Gather",
            currentRetail: 2.99,
            regularRetail: 3.49,
          }),
        ]),
      ),
      jsonResponse(targetCduiResponse([])),
      jsonResponse(
        targetCduiResponse([
          targetProduct({
            tcin: "parent",
            title: "Market Pantry Bread",
          }),
          targetProduct({
            tcin: "13264003",
            title: "Market Pantry Bread 20 oz",
            currentRetail: 1.99,
            regularRetail: 1.99,
          }),
        ]),
      ),
    ]);
    const collector = new TargetCollector({ apiKey: "test-key", fetch: fetchMock });

    await expect(collector.getPrices(["12953453", "missing", "13264003"], "1092")).resolves.toEqual([
      {
        externalProductId: "12953453",
        name: "Good & Gather Sparkling Water 12oz",
        brand: "Good & Gather",
        sizeRaw: "12 oz",
        upc: null,
        category: null,
        imageUrl: null,
        price: 3.49,
        promoPrice: 2.99,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
      {
        externalProductId: "13264003",
        name: "Market Pantry Bread 20 oz",
        brand: null,
        sizeRaw: "20 oz",
        upc: null,
        category: null,
        imageUrl: null,
        price: 1.99,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
    ]);

    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.slice(1).map((url) => url.searchParams.get("keyword"))).toEqual([
      "12953453",
      "missing",
      "13264003",
    ]);
    expect(
      urls.slice(1).every((url) => url.pathname === "/cdui_orchestrations/v1/pages/slp"),
    ).toBe(true);
    expect(urls.slice(1).map((url) => url.searchParams.get("page"))).toEqual([
      "/s/12953453",
      "/s/missing",
      "/s/13264003",
    ]);
    expect(new Set(urls.slice(1).map((url) => url.searchParams.get("visitor_id"))).size).toBe(1);
  });

  it("retries one 429 response using Retry-After", async () => {
    const fetchMock = queuedFetch([
      jsonResponse(targetLocation({ id: "1092" })),
      new Response(null, { status: 429, headers: { "Retry-After": "0" } }),
      jsonResponse(targetCduiResponse([])),
    ]);
    const collector = new TargetCollector({ apiKey: "test-key", fetch: fetchMock });

    await expect(collector.searchProducts("milk", "1092")).resolves.toEqual([]);

    expect(fetchMock.mock.calls).toHaveLength(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/cdui_orchestrations/v1/pages/slp");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/cdui_orchestrations/v1/pages/slp");
  });

  it("re-scrapes the web key and retries once after a Target API 403", async () => {
    const firstKey = "a".repeat(40);
    const refreshedKey = "b".repeat(40);
    const fetchMock = queuedFetch([
      htmlResponse(`"apiKey":"${firstKey}"`),
      new Response(null, { status: 403 }),
      htmlResponse(`"apiKey":"${refreshedKey}"`),
      jsonResponse(targetLocation({ id: "1092" })),
      jsonResponse(targetCduiResponse([])),
    ]);
    const collector = new TargetCollector({ fetch: fetchMock });

    await expect(collector.searchProducts("milk", "1092")).resolves.toEqual([]);

    expect(fetchMock.mock.calls).toHaveLength(5);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://www.target.com/");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://www.target.com/");

    const firstLocationUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    const retriedLocationUrl = new URL(String(fetchMock.mock.calls[3]?.[0]));
    const cduiUrl = new URL(String(fetchMock.mock.calls[4]?.[0]));
    expect(firstLocationUrl.searchParams.get("key")).toBe(firstKey);
    expect(retriedLocationUrl.searchParams.get("key")).toBe(refreshedKey);
    expect(cduiUrl.searchParams.get("key")).toBe(refreshedKey);
  });

  it("maps a second Target API 403 to an auth error", async () => {
    const fetchMock = queuedFetch([
      htmlResponse(`"apiKey":"${"a".repeat(40)}"`),
      new Response(null, { status: 403 }),
      htmlResponse(`"apiKey":"${"b".repeat(40)}"`),
      new Response(null, { status: 403 }),
    ]);
    const collector = new TargetCollector({ fetch: fetchMock });

    await expect(collector.searchProducts("milk", "1092")).rejects.toMatchObject({
      kind: "auth",
    });

    expect(fetchMock.mock.calls).toHaveLength(4);
  });

  it("uses TARGET_API_KEY without scraping", async () => {
    process.env.TARGET_API_KEY = "env-key";
    const fetchMock = queuedFetch([
      jsonResponse(targetLocation({ id: "1092" })),
      jsonResponse(targetCduiResponse([])),
    ]);
    const collector = new TargetCollector({ fetch: fetchMock });

    await expect(collector.searchProducts("milk", "1092")).resolves.toEqual([]);

    expect(fetchMock.mock.calls).toHaveLength(2);
    const locationUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const cduiUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(locationUrl.hostname).toBe("api.target.com");
    expect(locationUrl.searchParams.get("key")).toBe("env-key");
    expect(cduiUrl.hostname).toBe("cdui-orchestrations.target.com");
    expect(cduiUrl.searchParams.get("key")).toBe("env-key");
  });

  it("maps web key scrape failure without fallback to an auth error", async () => {
    const fetchMock = queuedFetch([new Response(null, { status: 500 })]);

    await expect(resolveWebKey(fetchMock, { forceRefresh: true })).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("is returned by the collector registry", () => {
    const previousApiKey = process.env.TARGET_API_KEY;
    const previousDisabled = process.env.TARGET_DISABLED;
    process.env.TARGET_API_KEY = "";
    delete process.env.TARGET_DISABLED;

    try {
      expect(getCollector("target")?.chain).toBe("target");
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.TARGET_API_KEY;
      } else {
        process.env.TARGET_API_KEY = previousApiKey;
      }

      if (previousDisabled === undefined) {
        delete process.env.TARGET_DISABLED;
      } else {
        process.env.TARGET_DISABLED = previousDisabled;
      }
    }
  });
});

function targetPreferredStores(ids: string[]) {
  return {
    preferred_stores: ids.map((id) => ({
      location_id: id,
      location_names: [{ name_type: "Proj Name", name: `Target ${id}` }],
    })),
  };
}

function targetLocation({
  id,
  name = "Cincinnati Oakley",
  addressLine = "3245 Geier Dr",
  city = "Cincinnati",
  region = "OH",
  zip = "45209-1234",
  lat = 39.1532,
  lng = -84.427,
  capabilities = [{ capability_name: "Fresh Grocery" }],
}: {
  id: string;
  name?: string;
  addressLine?: string;
  city?: string;
  region?: string;
  zip?: string;
  lat?: number | null;
  lng?: number | null;
  capabilities?: Array<Record<string, unknown>>;
}) {
  return {
    location_id: id,
    location_names: [{ name_type: "Proj Name", name }],
    address: [
      {
        address_context_code: "M",
        address_line1: addressLine,
        city,
        region,
        postal_code: zip,
      },
    ],
    geographic_specifications:
      lat === null || lng === null
        ? { time_zone_code: "EST", iso_time_zone_code: "America/New_York" }
        : {
            latitude: lat,
            longitude: lng,
            time_zone_code: "EST",
            iso_time_zone_code: "America/New_York",
          },
    capabilities,
  };
}

function targetCduiResponse(products: ReturnType<typeof targetProduct>[]) {
  return {
    data_source_modules: [
      {
        module_type: "SearchWebDataSource",
        module_data: {
          search_response: {
            products,
          },
        },
      },
    ],
  };
}

function targetProduct({
  tcin,
  title,
  brand,
  imageUrl,
  currentRetail,
  regularRetail,
}: {
  tcin: string;
  title: string;
  brand?: string;
  imageUrl?: string;
  currentRetail?: number;
  regularRetail?: number;
}) {
  return {
    tcin,
    item: {
      product_description: {
        title,
      },
      primary_brand: brand ? { name: brand } : undefined,
      enrichment: imageUrl
        ? {
            image_info: {
              primary_image: {
                url: imageUrl,
              },
            },
          }
        : undefined,
    },
    price:
      currentRetail === undefined
        ? undefined
        : {
            current_retail: currentRetail,
            reg_retail: regularRetail,
          },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html" },
  });
}

function queuedFetch(responses: Response[]) {
  return vi.fn<typeof fetch>(async () => {
    const response = responses.shift();

    if (!response) {
      throw new Error("Unexpected fetch call");
    }

    return response;
  });
}
