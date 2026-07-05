import { createVerify, generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { WalmartCollector } from "./walmart.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

describe("WalmartCollector", () => {
  it("signs Affiliate API requests with Walmart headers", async () => {
    const fetchMock = queuedFetch([
      jsonResponse({
        items: [],
      }),
    ]);
    const collector = new WalmartCollector({
      consumerId: "consumer-id",
      privateKey,
      keyVersion: "2",
      publisherId: "pub-1",
      baseUrl: "https://example.test/walmart",
      fetch: fetchMock,
      now: () => 1_783_186_187_000,
    });

    await expect(collector.searchProducts("milk", "1234")).resolves.toEqual([]);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(requestUrl));
    expect(url.toString()).toBe(
      "https://example.test/walmart/search?query=milk&storeId=1234&publisherId=pub-1",
    );

    const headers = requestInit?.headers as Record<string, string>;
    expect(headers).toMatchObject({
      Accept: "application/json",
      "WM_CONSUMER.ID": "consumer-id",
      "WM_CONSUMER.INTIMESTAMP": "1783186187000",
      "WM_SEC.KEY_VERSION": "2",
    });
    expect(headers["WM_QOS.CORRELATION_ID"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const verifier = createVerify("RSA-SHA256");
    verifier.update("consumer-id\n1783186187000\n2\n");
    verifier.end();
    expect(verifier.verify(publicKey, headers["WM_SEC.AUTH_SIGNATURE"] ?? "", "base64")).toBe(true);
  });

  it("maps nearby stores", async () => {
    const fetchMock = queuedFetch([
      jsonResponse({
        stores: [
          {
            storeId: 1521,
            name: "Walmart Supercenter",
            streetAddress: "2322 Ferguson Rd",
            city: "Cincinnati",
            state: "OH",
            zipCode: "45238",
            geoPoint: {
              latitude: 39.127,
              longitude: -84.603,
            },
          },
        ],
      }),
    ]);
    const collector = walmartCollector(fetchMock);

    await expect(collector.findStores("45202")).resolves.toEqual([
      {
        externalLocationId: "1521",
        name: "Walmart Supercenter",
        address: "2322 Ferguson Rd, Cincinnati, OH, 45238",
        zip: "45238",
        lat: 39.127,
        lng: -84.603,
      },
    ]);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/walmart/stores");
    expect(url.searchParams.get("zipCode")).toBe("45202");
  });

  it("maps product search results including promo, size, and image", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const fetchMock = queuedFetch([
      jsonResponse({
        items: [
          {
            itemId: 10450114,
            name: "Great Value Whole Milk, 1 Gallon",
            brandName: "Great Value",
            size: "1 gal",
            upc: "007874201020",
            categoryPath: "Food/Dairy/Milk",
            thumbnailImage: "https://i5.walmartimages.com/asr/milk.jpeg",
            salePrice: 2.72,
            msrp: 2.98,
          },
          {
            usItemId: "222",
            productName: "Bananas, each",
            currentPrice: { price: "0.27" },
          },
        ],
      }),
    ]);
    const collector = walmartCollector(fetchMock);

    await expect(collector.searchProducts("milk", "1521")).resolves.toEqual([
      {
        externalProductId: "10450114",
        name: "Great Value Whole Milk, 1 Gallon",
        brand: "Great Value",
        sizeRaw: "1 gal",
        upc: "007874201020",
        category: "Food/Dairy/Milk",
        imageUrl: "https://i5.walmartimages.com/asr/milk.jpeg",
        price: 2.98,
        promoPrice: 2.72,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
      {
        externalProductId: "222",
        name: "Bananas, each",
        brand: null,
        sizeRaw: null,
        upc: null,
        category: null,
        imageUrl: null,
        price: 0.27,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
    ]);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/walmart/search");
    expect(url.searchParams.get("query")).toBe("milk");
    expect(url.searchParams.get("storeId")).toBe("1521");
    vi.useRealTimers();
  });

  it("maps zero and negative Walmart prices to null", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const fetchMock = queuedFetch([
      jsonResponse({
        items: [
          {
            itemId: "zero-price",
            name: "Zero Price Item",
            salePrice: 0,
            msrp: 2.98,
          },
          {
            itemId: "negative-price",
            name: "Negative Price Item",
            currentPrice: { price: "-1" },
            listPrice: 2.98,
          },
        ],
      }),
    ]);
    const collector = walmartCollector(fetchMock);

    await expect(collector.searchProducts("milk", "1521")).resolves.toMatchObject([
      {
        externalProductId: "zero-price",
        price: null,
        promoPrice: null,
      },
      {
        externalProductId: "negative-price",
        price: null,
        promoPrice: null,
      },
    ]);
    vi.useRealTimers();
  });

  it("maps item price lookups and skips missing products", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const fetchMock = queuedFetch([
      jsonResponse({
        item: {
          itemId: "10450114",
          name: "Great Value Whole Milk, 1 Gallon",
          salePrice: 2.72,
        },
      }),
      new Response(null, { status: 404 }),
    ]);
    const collector = walmartCollector(fetchMock);

    await expect(collector.getPrices(["10450114", "missing"], "1521")).resolves.toEqual([
      {
        externalProductId: "10450114",
        name: "Great Value Whole Milk, 1 Gallon",
        brand: null,
        sizeRaw: null,
        upc: null,
        category: null,
        imageUrl: null,
        price: 2.72,
        promoPrice: null,
        capturedAt: new Date("2026-07-04T12:00:00Z"),
      },
    ]);

    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.map((url) => url.pathname)).toEqual([
      "/walmart/items/10450114",
      "/walmart/items/missing",
    ]);
    expect(urls.map((url) => url.searchParams.get("storeId"))).toEqual(["1521", "1521"]);
    vi.useRealTimers();
  });

  it("caps concurrent item price lookups", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      activeRequests -= 1;

      const itemId = new URL(String(url)).pathname.split("/").at(-1) ?? "unknown";
      return jsonResponse({
        item: {
          itemId,
          name: `Walmart Item ${itemId}`,
          salePrice: 1.99,
        },
      });
    });
    const collector = walmartCollector(fetchMock);

    await expect(collector.getPrices(["1", "2", "3", "4"], "1521")).resolves.toHaveLength(4);

    expect(maxActiveRequests).toBeLessThanOrEqual(2);
  });

  it("maps Walmart auth failures", async () => {
    const fetchMock = queuedFetch([new Response(null, { status: 403 })]);
    const collector = walmartCollector(fetchMock);

    await expect(collector.searchProducts("milk", "1521")).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("fails fast on Walmart 429 responses with long Retry-After values", async () => {
    const fetchMock = queuedFetch([
      new Response(null, { status: 429, headers: { "Retry-After": "86400" } }),
    ]);
    const collector = walmartCollector(fetchMock);

    await expect(collector.searchProducts("milk", "1521")).rejects.toMatchObject({
      kind: "rate-limit",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function walmartCollector(fetchMock: ReturnType<typeof queuedFetch>): WalmartCollector {
  return new WalmartCollector({
    consumerId: "consumer-id",
    privateKey,
    keyVersion: "1",
    baseUrl: "https://example.test/walmart",
    fetch: fetchMock,
    now: () => 1_783_186_187_000,
  });
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
