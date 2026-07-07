import type { Product } from "@cartwise/shared";
import { describe, expect, it } from "vitest";

import { compareProducts } from "./compare.js";

describe("compareProducts", () => {
  it("marks matching non-null UPCs as exact", () => {
    expect(compareProducts(product("a", { upc: "000111" }), product("b", { upc: "000111" }))).toMatchObject({
      tier: "exact",
      confidence: 1,
    });
  });

  it("treats store-brand large eggs across chains as comparable", () => {
    const comparison = compareProducts(
      product("eggs-a", {
        name: "Grade A Large Eggs 12ct",
        brand: null,
        sizeQty: 12,
        sizeUnit: "ct",
        category: "eggs",
      }),
      product("eggs-b", {
        name: "Grade A Large Eggs 12 ct",
        brand: "Market Pantry",
        sizeQty: 12,
        sizeUnit: "ct",
        category: "eggs",
      }),
    );

    expect(comparison.tier).toBe("comparable");
    expect(comparison.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("treats same-brand Cheerios with matching sizes as equivalent", () => {
    const comparison = compareProducts(
      product("cheerios-a", {
        name: "Cheerios 18 oz",
        brand: "Cheerios",
        sizeQty: 18,
        sizeUnit: "oz",
        category: "cereal",
      }),
      product("cheerios-b", {
        name: "Cheerios Cereal 18 oz",
        brand: "Cheerios",
        sizeQty: 18,
        sizeUnit: "oz",
        category: "cereal",
      }),
    );

    expect(comparison.tier).toBe("equivalent");
    expect(comparison.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("rejects egg packs with non-comparable counts", () => {
    expect(
      compareProducts(
        product("eggs-12", { name: "Grade A Large Eggs 12 ct", sizeQty: 12, sizeUnit: "ct" }),
        product("eggs-18", { name: "Grade A Large Eggs 18 ct", sizeQty: 18, sizeUnit: "ct" }),
      ).tier,
    ).toBe("none");
  });

  it("keeps different oil types below comparable confidence", () => {
    const comparison = compareProducts(
      product("olive-oil", {
        name: "Olive Oil 16.9 fl oz",
        sizeQty: 16.9,
        sizeUnit: "floz",
        category: "olive oil",
      }),
      product("canola-oil", {
        name: "Canola Oil 16.9 fl oz",
        sizeQty: 16.9,
        sizeUnit: "floz",
        category: "canola oil",
      }),
    );

    expect(comparison.tier).toBe("none");
    expect(comparison.confidence).toBeLessThan(0.6);
  });

  it("rejects shell eggs versus liquid egg whites", () => {
    expect(
      compareProducts(
        product("eggs", {
          name: "Grade A Large Eggs 12 ct",
          sizeQty: 12,
          sizeUnit: "ct",
          category: "eggs",
        }),
        product("egg-whites", {
          name: "Liquid Egg Whites 16 oz",
          sizeQty: 16,
          sizeUnit: "oz",
          category: "eggs",
        }),
      ).tier,
    ).toBe("none");
  });
});

function product(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: "Product",
    brand: "Brand",
    sizeQty: 12,
    sizeUnit: "oz",
    upc: null,
    category: "category",
    imageUrl: null,
    ...overrides,
  };
}
