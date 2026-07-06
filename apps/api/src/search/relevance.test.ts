import { describe, expect, it } from "vitest";

import { compareSearchableProducts, searchRelevanceScore } from "./relevance.js";

describe("searchRelevanceScore", () => {
  it("keeps shell eggs and close egg products for an eggs search", () => {
    expect(
      searchRelevanceScore("eggs", product("Grade A Large Eggs - 12ct - Good & Gather")),
    ).toBeGreaterThan(0);
    expect(
      searchRelevanceScore("eggs", product("Cage-Free Liquid Egg Whites - 32oz")),
    ).toBeGreaterThan(0);
    expect(
      searchRelevanceScore("eggs", product("Cage-Free Hard-Cooked Eggs - 6ct")),
    ).toBeGreaterThan(0);
  });

  it("drops off-intent eggs search products", () => {
    expect(searchRelevanceScore("eggs", product("Appleton Farms Premium Sliced Bacon"))).toBeNull();
    expect(searchRelevanceScore("eggs", product("Ferrero Kinder Joy Egg"))).toBeNull();
    expect(searchRelevanceScore("eggs", product("Wide Egg Noodles - 12oz"))).toBeNull();
    expect(searchRelevanceScore("eggs", product("Dash Ultimate Deluxe Egg Cooker"))).toBeNull();
    expect(searchRelevanceScore("eggs", product("Jimmy Dean Sausage Egg & Cheese Croissant"))).toBeNull();
  });

  it("requires every meaningful query token for multi-word searches", () => {
    expect(searchRelevanceScore("olive oil", product("Extra Virgin Olive Oil"))).toBeGreaterThan(0);
    expect(searchRelevanceScore("olive oil", product("Black Olives"))).toBeNull();
    expect(searchRelevanceScore("olive oil", product("Vegetable Oil"))).toBeNull();
  });

  it("handles singular and plural wording", () => {
    expect(searchRelevanceScore("berries", product("Organic Strawberry Berry Blend"))).toBeGreaterThan(0);
    expect(searchRelevanceScore("tomatoes", product("Roma Tomato"))).toBeGreaterThan(0);
  });
});

describe("compareSearchableProducts", () => {
  it("puts direct name matches before weaker brand matches", () => {
    const sorted = [
      product("Store Brand Large Eggs", "Eggland"),
      product("Grade A Large Eggs", "Good & Gather"),
    ].sort((left, right) => compareSearchableProducts("eggs", left, right));

    expect(sorted.map((item) => item.name)).toEqual([
      "Grade A Large Eggs",
      "Store Brand Large Eggs",
    ]);
  });
});

function product(name: string, brand: string | null = null, category: string | null = null) {
  return { name, brand, category };
}
