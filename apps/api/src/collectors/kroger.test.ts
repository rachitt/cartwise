import { beforeEach, describe, expect, it, vi } from "vitest";

import { KrogerCollector } from "./kroger.js";

const tokenResponse = (accessToken: string, expiresIn = 3_600) =>
  jsonResponse({ access_token: accessToken, expires_in: expiresIn });

describe("KrogerCollector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes cached tokens before expiry", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = queuedFetch([
      tokenResponse("first-token", 120),
      jsonResponse({ data: [] }),
      jsonResponse({ data: [] }),
      tokenResponse("second-token", 120),
      jsonResponse({ data: [] }),
    ]);
    const collector = new KrogerCollector({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock,
    });

    await collector.searchProducts("milk", "loc-1");
    await collector.searchProducts("eggs", "loc-1");
    now += 61_000;
    await collector.searchProducts("bread", "loc-1");

    const tokenCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/v1/connect/oauth2/token"),
    );
    const productCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/v1/products"));

    expect(tokenCalls).toHaveLength(2);
    expect(productCalls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer first-token" });
    expect(productCalls[1]?.[1]?.headers).toMatchObject({ Authorization: "Bearer first-token" });
    expect(productCalls[2]?.[1]?.headers).toMatchObject({ Authorization: "Bearer second-token" });
  });

  it("re-authenticates once after a 401 response", async () => {
    const fetchMock = queuedFetch([
      tokenResponse("stale-token"),
      new Response(null, { status: 401 }),
      tokenResponse("fresh-token"),
      jsonResponse({ data: [] }),
    ]);
    const collector = new KrogerCollector({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock,
    });

    await expect(collector.searchProducts("milk", "loc-1")).resolves.toEqual([]);

    const productCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/v1/products"));
    expect(productCalls).toHaveLength(2);
    expect(productCalls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer stale-token" });
    expect(productCalls[1]?.[1]?.headers).toMatchObject({ Authorization: "Bearer fresh-token" });
  });

  it("maps nearby stores", async () => {
    const fetchMock = queuedFetch([
      tokenResponse("token"),
      jsonResponse({
        data: [
          {
            locationId: "01400422",
            name: "Kroger Hyde Park",
            address: {
              addressLine1: "3760 Paxton Ave",
              city: "Cincinnati",
              state: "OH",
              zipCode: "45209",
            },
            geolocation: {
              latitude: 39.1465,
              longitude: -84.4298,
            },
            hours: weeklyHours(),
          },
        ],
      }),
    ]);
    const collector = new KrogerCollector({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock,
    });

    await expect(collector.findStores("45202")).resolves.toEqual([
      {
        externalLocationId: "01400422",
        name: "Kroger Hyde Park",
        address: "3760 Paxton Ave, Cincinnati, OH, 45209",
        zip: "45209",
        lat: 39.1465,
        lng: -84.4298,
      },
    ]);

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/v1/locations?filter.zipCode.near=45202&filter.limit=10",
    );
  });

  it("filters internal and non-grocery locations from nearby stores", async () => {
    const fetchMock = queuedFetch([
      tokenResponse("token"),
      jsonResponse({
        data: [
          {
            locationId: "01400513",
            name: "Kroger - Kroger On the Rhine",
            phone: "5132635900",
            address: {
              addressLine1: "100 E Court St",
              city: "Cincinnati",
              state: "OH",
              zipCode: "45202",
            },
            geolocation: {
              latitude: 39.10682,
              longitude: -84.51253,
            },
            hours: weeklyHours(),
          },
          {
            locationId: "540FC200",
            name: "Kroger - Spoke Forecast",
            address: {
              addressLine1: "1014 Vine St",
              city: "Cincinnati",
              state: "OH",
              zipCode: "45202",
            },
            geolocation: {
              latitude: 39.106758,
              longitude: -84.513951,
            },
            hours: { timezone: "America/New_York" },
          },
          {
            locationId: "01400929-FUEL",
            name: "Kroger Fuel Center",
            phone: "5135551212",
            address: {
              addressLine1: "1 W Corry St",
              city: "Cincinnati",
              state: "OH",
              zipCode: "45219",
            },
            geolocation: {
              latitude: 39.128667,
              longitude: -84.509336,
            },
            hours: weeklyHours(),
          },
          {
            locationId: "540FC000",
            name: "Kroger - Zero Warehouse",
            phone: "9999999999",
            address: {
              addressLine1: "1014 Vine St",
              city: "Cincinnati",
              state: "OH",
              zipCode: "45202",
            },
            geolocation: {
              latitude: 39.106758,
              longitude: -84.513951,
            },
            hours: weeklyHours(),
          },
        ],
      }),
    ]);
    const collector = new KrogerCollector({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock,
    });

    await expect(collector.findStores("45202")).resolves.toEqual([
      {
        externalLocationId: "01400513",
        name: "Kroger - Kroger On the Rhine",
        address: "100 E Court St, Cincinnati, OH, 45202",
        zip: "45202",
        lat: 39.10682,
        lng: -84.51253,
      },
    ]);
  });

  it("maps product search results including promo, size, image, and missing price", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const fetchMock = queuedFetch([
      tokenResponse("token"),
      jsonResponse({
        data: [
          {
            productId: "0001111041700",
            upc: "0001111041700",
            brand: "Kroger",
            description: "Kroger 2% Milk",
            categories: ["Dairy"],
            images: [
              {
                perspective: "front",
                sizes: [
                  { size: "small", url: "https://example.com/small.jpg" },
                  { size: "medium", url: "https://example.com/medium.jpg" },
                ],
              },
            ],
            items: [
              {
                size: "1 gal",
                price: { regular: 3.49, promo: 2.99 },
              },
            ],
          },
          {
            productId: "0001111008464",
            upc: "0001111008464",
            description: "Banana",
            categories: ["Produce"],
            images: [],
            items: [{ size: "1 ct" }],
          },
          {
            productId: "0001111087654",
            brand: "Simple Truth",
            description: "Sparkling Water",
            items: [{ size: "16.9 fl oz", price: { regular: 1.25, promo: 0 } }],
          },
        ],
      }),
    ]);
    const collector = new KrogerCollector({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock,
    });

    await expect(collector.searchProducts("milk", "01400422")).resolves.toEqual([
      {
        externalProductId: "0001111041700",
        name: "Kroger 2% Milk",
        brand: "Kroger",
        sizeRaw: "1 gal",
        upc: "0001111041700",
        category: "Dairy",
        imageUrl: "https://example.com/medium.jpg",
        price: 3.49,
        promoPrice: 2.99,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
      {
        externalProductId: "0001111008464",
        name: "Banana",
        brand: null,
        sizeRaw: "1 ct",
        upc: "0001111008464",
        category: "Produce",
        imageUrl: null,
        price: null,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
      {
        externalProductId: "0001111087654",
        name: "Sparkling Water",
        brand: "Simple Truth",
        sizeRaw: "16.9 fl oz",
        upc: null,
        category: null,
        imageUrl: null,
        price: 1.25,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
    ]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/v1/products?filter.term=milk&filter.locationId=01400422&filter.limit=20",
    );
    vi.useRealTimers();
  });

  it("retries one 429 response using Retry-After", async () => {
    const fetchMock = queuedFetch([
      tokenResponse("token"),
      new Response(null, { status: 429, headers: { "Retry-After": "0" } }),
      jsonResponse({ data: [] }),
    ]);
    const collector = new KrogerCollector({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock,
    });

    await expect(collector.searchProducts("milk", "loc-1")).resolves.toEqual([]);

    const productCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/v1/products"));
    expect(productCalls).toHaveLength(2);
  });
});

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

function weeklyHours() {
  return {
    monday: { open: "06:00", close: "22:00", open24: false },
    tuesday: { open: "06:00", close: "22:00", open24: false },
    wednesday: { open: "06:00", close: "22:00", open24: false },
    thursday: { open: "06:00", close: "22:00", open24: false },
    friday: { open: "06:00", close: "22:00", open24: false },
    saturday: { open: "06:00", close: "22:00", open24: false },
    sunday: { open: "06:00", close: "22:00", open24: false },
  };
}
