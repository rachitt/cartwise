import type { Product, Store, StorePrice } from "@cartwise/shared";
import { describe, expect, it } from "vitest";

import { OptimizerError, optimizeCart, type OptimizerInput } from "./optimize.js";

describe("optimizeCart", () => {
  it("chooses the lowest covered store and reports savings against the worst covered store", () => {
    const result = optimizeCart({
      items: [
        { productId: "milk", qty: 1 },
        { productId: "eggs", qty: 2 },
      ],
      stores: [store("kroger", "Kroger"), store("target", "Target")],
      prices: [
        price("milk", "kroger", 4),
        price("eggs", "kroger", 3),
        price("milk", "target", 5),
        price("eggs", "target", 4),
      ],
      alternatives: withOriginals(product("milk"), product("eggs")),
    });

    expect(result.winningStoreId).toBe("kroger");
    expect(result.winningTotal).toBe(10);
    expect(result.worstTotal).toBe(13);
    expect(result.savings).toBe(3);
    expect(result.perStoreTotals).toEqual([
      expect.objectContaining({
        storeId: "kroger",
        total: 10,
        missingItems: [],
        coveredItemCount: 2,
        itemCount: 2,
        substitutionCount: 0,
        pricesAsOf: "2026-07-04T12:00:00.000Z",
        lines: [
          {
            productId: "milk",
            qty: 1,
            unitPrice: 4,
            lineTotal: 4,
            capturedAt: "2026-07-04T12:00:00.000Z",
          },
          {
            productId: "eggs",
            qty: 2,
            unitPrice: 3,
            lineTotal: 6,
            capturedAt: "2026-07-04T12:00:00.000Z",
          },
        ],
      }),
      expect.objectContaining({
        storeId: "target",
        total: 13,
        missingItems: [],
        coveredItemCount: 2,
        itemCount: 2,
        substitutionCount: 0,
      }),
    ]);
    expect(result.pricesAsOf).toBe("2026-07-04T12:00:00.000Z");
  });

  it("reports stores below 70% coverage but excludes them from winning", () => {
    const result = optimizeCart({
      items: [
        { productId: "a", qty: 1 },
        { productId: "b", qty: 1 },
        { productId: "c", qty: 1 },
        { productId: "d", qty: 1 },
      ],
      stores: [store("cheap", "Cheap"), store("covered", "Covered")],
      prices: [
        price("a", "cheap", 1),
        price("b", "cheap", 1),
        price("a", "covered", 3),
        price("b", "covered", 3),
        price("c", "covered", 3),
      ],
      alternatives: withOriginals(product("a"), product("b"), product("c"), product("d")),
    });

    expect(result.winningStoreId).toBe("covered");
    expect(result.perStoreTotals).toContainEqual(
      expect.objectContaining({
        storeId: "cheap",
        total: 2,
        missingItems: ["c", "d"],
        coveredItemCount: 2,
        itemCount: 4,
      }),
    );
  });

  it("falls back to highest coverage then cheapest when every store is below coverage", () => {
    const result = optimizeCart({
      items: [
        { productId: "a", qty: 1 },
        { productId: "b", qty: 1 },
        { productId: "c", qty: 1 },
      ],
      stores: [store("alpha", "Alpha"), store("beta", "Beta"), store("gamma", "Gamma")],
      prices: [
        price("a", "alpha", 4),
        price("b", "alpha", 4),
        price("a", "beta", 3),
        price("b", "beta", 3),
        price("a", "gamma", 1),
      ],
      alternatives: withOriginals(product("a"), product("b"), product("c")),
    });

    expect(result.winningStoreId).toBe("beta");
    expect(result.winningTotal).toBe(6);
    expect(result.worstTotal).toBe(8);
    expect(result.savings).toBe(2);
  });

  it("uses deterministic tie-breaks by missing count and then store name", () => {
    const result = optimizeCart({
      items: [
        { productId: "a", qty: 1 },
        { productId: "b", qty: 1 },
      ],
      stores: [
        store("zeta", "Zeta"),
        store("alpha", "Alpha"),
        store("less-missing", "Less Missing"),
      ],
      prices: [
        price("a", "zeta", 4),
        price("a", "alpha", 4),
        price("a", "less-missing", 2),
        price("b", "less-missing", 2),
      ],
      alternatives: withOriginals(product("a"), product("b")),
    });

    expect(result.winningStoreId).toBe("less-missing");

    const alphabetical = optimizeCart({
      items: [{ productId: "a", qty: 1 }],
      stores: [store("zeta", "Zeta"), store("alpha", "Alpha")],
      prices: [price("a", "zeta", 4), price("a", "alpha", 4)],
      alternatives: withOriginals(product("a")),
    });

    expect(alphabetical.winningStoreId).toBe("alpha");
  });

  it("preserves promoPrice zero and multiplies quantities", () => {
    const result = optimizeCart({
      items: [{ productId: "freebie", qty: 3 }],
      stores: [store("free", "Free"), store("paid", "Paid")],
      prices: [price("freebie", "free", 5, 0), price("freebie", "paid", 2)],
      alternatives: withOriginals(product("freebie")),
    });

    expect(result.winningStoreId).toBe("free");
    expect(result.winningTotal).toBe(0);
    expect(result.worstTotal).toBe(6);
    expect(result.savings).toBe(6);
  });

  it("treats null prices as unavailable instead of free", () => {
    const result = optimizeCart({
      items: [{ productId: "milk", qty: 1 }],
      stores: [store("unknown-price", "Unknown Price"), store("priced", "Priced")],
      prices: [nullPrice("milk", "unknown-price"), price("milk", "priced", 4)],
      alternatives: withOriginals(product("milk")),
    });

    expect(result.winningStoreId).toBe("priced");
    expect(result.perStoreTotals).toContainEqual(
      expect.objectContaining({
        storeId: "unknown-price",
        total: 0,
        missingItems: ["milk"],
        coveredItemCount: 0,
        itemCount: 1,
      }),
    );
  });

  it("flags the best cheaper-elsewhere price per item by per-unit delta", () => {
    const result = optimizeCart({
      items: [
        { productId: "milk", qty: 2 },
        { productId: "bread", qty: 1 },
      ],
      stores: [store("winner", "Winner"), store("near", "Near"), store("best", "Best")],
      prices: [
        price("milk", "winner", 5),
        price("bread", "winner", 1),
        price("milk", "near", 4.8),
        price("bread", "near", 3),
        price("milk", "best", 4.5),
        price("bread", "best", 3),
      ],
      alternatives: withOriginals(product("milk"), product("bread")),
    });

    expect(result.cheaperElsewhere).toEqual([
      { productId: "milk", storeId: "best", price: 4.5, delta: 0.5 },
    ]);
  });

  it("suggests the best same-family unit-price swap at the winning store", () => {
    const original = product("original", { brand: "National", sizeQty: 16, sizeUnit: "oz" });
    const storeBrand = product("store-brand", { brand: "Store", sizeQty: 1, sizeUnit: "lb" });
    const sameBrand = product("same-brand", { brand: "National", sizeQty: 16, sizeUnit: "oz" });

    const result = optimizeCart({
      items: [{ productId: "original", qty: 2 }],
      stores: [store("winner", "Winner")],
      prices: [
        price("original", "winner", 4),
        price("store-brand", "winner", 3),
        price("same-brand", "winner", 3.25),
      ],
      alternatives: {
        original: [
          { product: original, prices: [price("original", "winner", 4)] },
          {
            product: storeBrand,
            prices: [price("store-brand", "winner", 3)],
            comparison: comparison("comparable", 0.8),
          },
          {
            product: sameBrand,
            prices: [price("same-brand", "winner", 3.25)],
            comparison: comparison("equivalent", 0.9),
          },
        ],
      },
    });

    expect(result.swapSuggestions).toEqual([
      {
        fromProductId: "original",
        toProductId: "store-brand",
        savings: 2,
        reason: "cheaper-brand",
        matchTier: "comparable",
        matchConfidence: 0.8,
      },
    ]);
  });

  it("does not suggest a same-category low-confidence product", () => {
    const original = product("olive-oil", {
      name: "Olive Oil 16.9 fl oz",
      category: "cooking oil",
      sizeQty: 16.9,
      sizeUnit: "floz",
    });
    const lowConfidence = product("canola-oil", {
      name: "Canola Oil 16.9 fl oz",
      category: "cooking oil",
      sizeQty: 16.9,
      sizeUnit: "floz",
    });

    const result = optimizeCart({
      items: [{ productId: "olive-oil", qty: 1 }],
      stores: [store("winner", "Winner")],
      prices: [price("olive-oil", "winner", 9), price("canola-oil", "winner", 3)],
      alternatives: {
        "olive-oil": [
          { product: original, prices: [price("olive-oil", "winner", 9)] },
          {
            product: lowConfidence,
            prices: [price("canola-oil", "winner", 3)],
            comparison: comparison("none", 0.59),
          },
        ],
      },
    });

    expect(result.swapSuggestions).toEqual([]);
  });

  it("skips cross-unit swap comparisons", () => {
    const original = product("juice", { sizeQty: 64, sizeUnit: "floz" });
    const metric = product("metric-juice", { sizeQty: 1, sizeUnit: "l" });

    const result = optimizeCart({
      items: [{ productId: "juice", qty: 1 }],
      stores: [store("winner", "Winner")],
      prices: [price("juice", "winner", 5), price("metric-juice", "winner", 1)],
      alternatives: {
        juice: [
          { product: original, prices: [price("juice", "winner", 5)] },
          { product: metric, prices: [price("metric-juice", "winner", 1)] },
        ],
      },
    });

    expect(result.swapSuggestions).toEqual([]);
  });

  it("throws a typed OptimizerError for an empty cart", () => {
    expect(() =>
      optimizeCart({
        items: [],
        stores: [store("kroger", "Kroger")],
        prices: [],
        alternatives: {},
      }),
    ).toThrow(OptimizerError);
  });

  it("handles an item priced at only one selected store", () => {
    const result = optimizeCart({
      items: [{ productId: "rare", qty: 1 }],
      stores: [store("has-it", "Has It"), store("missing-it", "Missing It")],
      prices: [price("rare", "has-it", 7)],
      alternatives: withOriginals(product("rare")),
    });

    expect(result.winningStoreId).toBe("has-it");
    expect(result.perStoreTotals).toContainEqual(
      expect.objectContaining({
        storeId: "missing-it",
        total: 0,
        missingItems: ["rare"],
        coveredItemCount: 0,
        itemCount: 1,
      }),
    );
  });

  it("uses comparable substitutions for store bill lines but never tier-none matches", () => {
    const original = product("olive-oil", {
      name: "Olive Oil 16.9 fl oz",
      category: "cooking oil",
      sizeQty: 16.9,
      sizeUnit: "floz",
    });
    const comparable = product("store-olive-oil", {
      name: "Store Olive Oil 16.9 fl oz",
      category: "cooking oil",
      sizeQty: 16.9,
      sizeUnit: "floz",
    });
    const tierNone = product("canola-oil", {
      name: "Canola Oil 16.9 fl oz",
      category: "cooking oil",
      sizeQty: 16.9,
      sizeUnit: "floz",
    });

    const result = optimizeCart({
      items: [{ productId: "olive-oil", qty: 2 }],
      stores: [store("store", "Store")],
      prices: [],
      alternatives: {
        "olive-oil": [
          { product: original, prices: [] },
          {
            product: tierNone,
            prices: [price("canola-oil", "store", 3)],
            comparison: comparison("none", 0.99),
          },
          {
            product: comparable,
            prices: [price("store-olive-oil", "store", 5)],
            comparison: comparison("comparable", 0.8),
          },
        ],
      },
    });

    expect(result.perStoreTotals[0]).toMatchObject({
      storeId: "store",
      total: 10,
      missingItems: [],
      coveredItemCount: 1,
      itemCount: 1,
      substitutionCount: 1,
      lines: [
        {
          productId: "olive-oil",
          substitutedProductId: "store-olive-oil",
          qty: 2,
          unitPrice: 5,
          lineTotal: 10,
          capturedAt: "2026-07-04T12:00:00.000Z",
        },
      ],
    });
  });
});

function store(id: string, name: string): Store {
  return {
    id,
    chain: "kroger",
    name,
    address: `${name} Address`,
    zip: "45202",
    lat: 39.1,
    lng: -84.5,
  };
}

function product(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: id,
    brand: "Brand",
    sizeQty: 16,
    sizeUnit: "oz",
    upc: null,
    category: "category",
    imageUrl: null,
    ...overrides,
  };
}

function price(
  productId: string,
  storeId: string,
  priceValue: number,
  promoPrice: number | null = null,
  capturedAt = "2026-07-04T12:00:00.000Z",
): StorePrice {
  return {
    productId,
    storeId,
    price: priceValue,
    promoPrice,
    capturedAt,
    source: "kroger",
  };
}

function nullPrice(productId: string, storeId: string): StorePrice {
  return {
    productId,
    storeId,
    price: null as unknown as number,
    promoPrice: null,
    capturedAt: "2026-07-04T12:00:00.000Z",
    source: "kroger",
  };
}

function withOriginals(...products: Product[]): OptimizerInput["alternatives"] {
  return Object.fromEntries(
    products.map((productRow) => [productRow.id, [{ product: productRow, prices: [] }]]),
  );
}

function comparison(tier: "exact" | "equivalent" | "comparable" | "none", confidence: number) {
  return { tier, confidence, reasons: [] };
}
