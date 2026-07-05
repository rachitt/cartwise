import { describe, expect, it, vi } from "vitest";

import { AldiCollector } from "./aldi.js";

describe("AldiCollector", () => {
  it("maps the ZIP-scoped ALDI storefront location", async () => {
    const fetchMock = queuedFetch([htmlResponse(storefrontState())]);
    const collector = aldiCollector(fetchMock);

    await expect(collector.findStores("45202")).resolves.toEqual([
      {
        externalLocationId: "20727:92766:78:45202",
        name: "ALDI - SPR 85 - Newport",
        address: "1301 Monmouth Street, Newport, KY 41071",
        zip: "41071",
        lat: 39.0856527,
        lng: -84.4848598,
      },
    ]);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.toString()).toBe("https://example.test/store/aldi/storefront?zipcode=45202");
  });

  it("searches products with an anonymous guest session and maps live prices", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const fetchMock = queuedFetch([
      htmlResponse(storefrontState()),
      jsonResponse({
        data: {
          searchResults: {
            primaryItemResultList: {
              itemIds: ["items_20727-16902710", "items_20727-27480954"],
              items: [
                aldiItem({
                  id: "items_20727-16902710",
                  name: "Friendly Farms Whole Milk",
                  brandName: "friendly farms",
                  size: "1 gal",
                  priceString: "$3.09",
                }),
                aldiItem({
                  id: "items_20727-27480954",
                  name: "Sunset Brands Cotton Candy Grapes, Package",
                  brandName: "sunset brands",
                  size: "2 lb",
                  priceString: "$4.99",
                  plainFullPriceString: "$7.69",
                }),
              ],
            },
          },
        },
      }),
    ]);
    const collector = aldiCollector(fetchMock);

    await expect(collector.searchProducts("milk", "20727:92766:78:45202")).resolves.toEqual([
      {
        externalProductId: "items_20727-16902710",
        name: "Friendly Farms Whole Milk",
        brand: "friendly farms",
        sizeRaw: "1 gal",
        upc: null,
        category: null,
        imageUrl: "https://example.test/items_20727-16902710.jpg",
        price: 3.09,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
      {
        externalProductId: "items_20727-27480954",
        name: "Sunset Brands Cotton Candy Grapes, Package",
        brand: "sunset brands",
        sizeRaw: "2 lb",
        upc: null,
        category: null,
        imageUrl: "https://example.test/items_20727-27480954.jpg",
        price: 7.69,
        promoPrice: 4.99,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
    ]);

    const searchUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(searchUrl.pathname).toBe("/graphql");
    expect(searchUrl.searchParams.get("operationName")).toBe("Search");
    expect(JSON.parse(searchUrl.searchParams.get("variables") ?? "{}")).toEqual({
      query: "milk",
      shopId: "92766",
      zoneId: "78",
      postalCode: "45202",
    });
    expect(JSON.parse(searchUrl.searchParams.get("extensions") ?? "{}")).toEqual({
      persistedQuery: {
        version: 1,
        sha256Hash: "775d628502396ec608b292911723b045bf5ebba2f2c02c04536e4887c365b1a2",
      },
    });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer guest-token",
    });
    vi.useRealTimers();
  });

  it("hydrates item details and prices for price refreshes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const fetchMock = queuedFetch([
      htmlResponse(storefrontState()),
      jsonResponse({
        data: {
          items: [
            aldiItem({
              id: "items_20727-16902710",
              name: "Friendly Farms Whole Milk",
              brandName: "friendly farms",
              size: "1 gal",
            }),
          ],
        },
      }),
      jsonResponse({
        data: {
          itemPrices: [
            aldiPrice({
              itemId: "items_20727-16902710",
              priceString: "$3.09",
            }),
          ],
        },
      }),
    ]);
    const collector = aldiCollector(fetchMock);

    await expect(
      collector.getPrices(["items_20727-16902710", "missing"], "20727:92766:78:45202"),
    ).resolves.toEqual([
      {
        externalProductId: "items_20727-16902710",
        name: "Friendly Farms Whole Milk",
        brand: "friendly farms",
        sizeRaw: "1 gal",
        upc: null,
        category: null,
        imageUrl: "https://example.test/items_20727-16902710.jpg",
        price: 3.09,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
    ]);

    const graphqlUrls = fetchMock.mock.calls.slice(1).map(([url]) => new URL(String(url)));
    expect(graphqlUrls.map((url) => url.searchParams.get("operationName"))).toEqual([
      "Items",
      "ItemPricesQuery",
    ]);
    vi.useRealTimers();
  });

  it("maps ALDI auth failures", async () => {
    const fetchMock = queuedFetch([htmlResponse(storefrontState()), new Response(null, { status: 403 })]);
    const collector = aldiCollector(fetchMock);

    await expect(collector.searchProducts("milk", "20727:92766:78:45202")).rejects.toMatchObject({
      kind: "auth",
    });
  });
});

function aldiCollector(fetchMock: ReturnType<typeof queuedFetch>): AldiCollector {
  return new AldiCollector({
    baseUrl: "https://example.test",
    fetch: fetchMock,
    now: () => Date.now(),
  });
}

function storefrontState() {
  return {
    CreateImplicitGuestUser: {
      "{}": {
        createImplicitGuestUser: {
          authToken: {
            token: "guest-token",
            expires: "2026-08-03T12:00:00Z",
          },
        },
      },
    },
    GetLastUserLocation: {
      "{}": {
        lastUserLocation: {
          postalCode: "45202",
          zoneId: "78",
          coordinates: {
            latitude: 39.109055,
            longitude: -84.501686,
          },
        },
      },
    },
    Shop: {
      '{"id":"92766"}': {
        shop: {
          id: "92766",
          retailerLocationId: "20727",
          serviceType: "delivery",
        },
      },
      '{"id":"92223"}': {
        shop: {
          id: "92223",
          retailerLocationId: "20727",
          serviceType: "pickup",
        },
      },
    },
    GetRetailerLocationAddress: {
      '{"id":"20727"}': {
        retailerLocation: {
          id: "20727",
          coordinates: {
            latitude: 39.0856527,
            longitude: -84.4848598,
          },
          viewSection: {
            address: {
              lineOneString: "1301 Monmouth Street",
              lineTwoString: "Newport, KY 41071",
            },
            locationDisplayNameString: "ALDI - SPR 85 - Newport",
          },
        },
      },
    },
  };
}

function aldiItem({
  id,
  name,
  brandName,
  size,
  priceString,
  plainFullPriceString,
}: {
  id: string;
  name: string;
  brandName?: string;
  size?: string;
  priceString?: string;
  plainFullPriceString?: string;
}) {
  return {
    id,
    name,
    productId: id.split("-").at(1),
    brandName,
    size,
    availability: { available: true },
    viewSection: {
      itemImage: {
        url: `https://example.test/${id}.jpg`,
      },
    },
    price: priceString
      ? aldiPrice({
          itemId: id,
          priceString,
          plainFullPriceString,
        })
      : null,
  };
}

function aldiPrice({
  itemId,
  priceString,
  plainFullPriceString,
}: {
  itemId: string;
  priceString: string;
  plainFullPriceString?: string;
}) {
  return {
    itemId,
    viewSection: {
      itemCard: {
        priceString,
        plainFullPriceString,
      },
    },
  };
}

function htmlResponse(state: unknown): Response {
  return new Response(
    `<html><script id="node-apollo-state" type="application/json">${encodeURIComponent(
      JSON.stringify(state),
    )}</script></html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html" },
    },
  );
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
