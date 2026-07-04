import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCollector } from "./registry.js";
import { TargetCollector } from "./target.js";

describe("TargetCollector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps nearby stores", async () => {
    const fetchMock = queuedFetch([
      jsonResponse({
        data: {
          nearby_stores: {
            stores: [
              {
                store_id: "1092",
                location_name: "Cincinnati Oakley",
                mailing_address: {
                  address_line1: "3245 Geier Dr",
                  city: "Cincinnati",
                  region: "OH",
                  postal_code: "45209",
                },
                geographic_specifications: {
                  latitude: 39.1532,
                  longitude: -84.427,
                },
              },
            ],
          },
        },
      }),
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

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/redsky_aggregations/v1/web/nearby_stores_v1");
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("within")).toBe("20");
    expect(url.searchParams.get("place")).toBe("45202");
    expect(url.searchParams.get("channel")).toBe("WEB");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: "application/json",
    });
  });

  it("maps product search results including sale, regular, and missing prices", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const fetchMock = queuedFetch([
      jsonResponse({
        data: {
          search: {
            products: [
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
            ],
          },
        },
      }),
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

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/redsky_aggregations/v1/web/plp_search_v2");
    expect(url.searchParams.get("keyword")).toBe("water");
    expect(url.searchParams.get("count")).toBe("20");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("pricing_store_id")).toBe("1092");
    expect(url.searchParams.get("channel")).toBe("WEB");
  });

  it("maps PDP price lookups and skips 404 products", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const fetchMock = queuedFetch([
      jsonResponse({
        data: {
          product: targetProduct({
            tcin: "12953453",
            title: "Good & Gather Sparkling Water 12oz",
            brand: "Good & Gather",
            currentRetail: 2.99,
            regularRetail: 3.49,
          }),
        },
      }),
      new Response(null, { status: 404 }),
      jsonResponse({
        data: {
          product: targetProduct({
            tcin: "13264003",
            title: "Market Pantry Bread 20 oz",
            currentRetail: 1.99,
            regularRetail: 1.99,
          }),
        },
      }),
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
    expect(urls.map((url) => url.searchParams.get("tcin"))).toEqual([
      "12953453",
      "missing",
      "13264003",
    ]);
    expect(urls.every((url) => url.pathname === "/redsky_aggregations/v1/web/pdp_client_v1")).toBe(
      true,
    );
  });

  it("retries one 429 response using Retry-After", async () => {
    const fetchMock = queuedFetch([
      new Response(null, { status: 429, headers: { "Retry-After": "0" } }),
      jsonResponse({ data: { search: { products: [] } } }),
    ]);
    const collector = new TargetCollector({ apiKey: "test-key", fetch: fetchMock });

    await expect(collector.searchProducts("milk", "1092")).resolves.toEqual([]);

    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("/plp_search_v2"))).toBe(true);
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
            images: {
              primary_image_url: imageUrl,
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

function queuedFetch(responses: Response[]) {
  return vi.fn<typeof fetch>(async () => {
    const response = responses.shift();

    if (!response) {
      throw new Error("Unexpected fetch call");
    }

    return response;
  });
}
