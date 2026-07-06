import { describe, expect, it } from "vitest";

import { parseSize, toComparableSize } from "./size.js";

describe("parseSize", () => {
  it.each([
    ["12 oz", { sizeQty: 12, sizeUnit: "oz" }],
    ["1 gal", { sizeQty: 1, sizeUnit: "gal" }],
    ["1 qt", { sizeQty: 1, sizeUnit: "qt" }],
    ["2 pints", { sizeQty: 2, sizeUnit: "pt" }],
    ["16.9 fl oz", { sizeQty: 16.9, sizeUnit: "floz" }],
    ["6 ct", { sizeQty: 6, sizeUnit: "ct" }],
    ["2 lb", { sizeQty: 2, sizeUnit: "lb" }],
    ["500 ml", { sizeQty: 500, sizeUnit: "ml" }],
    ["3 pounds", { sizeQty: 3, sizeUnit: "lb" }],
    ["24 count", { sizeQty: 24, sizeUnit: "ct" }],
    ["1.5 liters", { sizeQty: 1.5, sizeUnit: "l" }],
    ["454 g", { sizeQty: 454, sizeUnit: "g" }],
    ["1 kg", { sizeQty: 1, sizeUnit: "kg" }],
    [" 8   ounces ", { sizeQty: 8, sizeUnit: "oz" }],
    ["12 oz bottle", { sizeQty: 12, sizeUnit: "oz" }],
    ["6 ct bag", { sizeQty: 6, sizeUnit: "ct" }],
    ["not a size", null],
    ["", null],
    [null, null],
  ])("parses %s", (sizeRaw, expected) => {
    expect(parseSize(sizeRaw)).toEqual(expected);
  });

  it.each([
    [16, "oz", { qty: 16, unit: "oz" }],
    [1, "lb", { qty: 16, unit: "oz" }],
    [500, "ml", { qty: 500, unit: "ml" }],
    [1.5, "l", { qty: 1_500, unit: "ml" }],
    [64, "floz", { qty: 64, unit: "floz" }],
    [1, "gal", { qty: 128, unit: "floz" }],
    [1, "qt", { qty: 32, unit: "floz" }],
    [1, "pt", { qty: 16, unit: "floz" }],
    [12, "ct", { qty: 12, unit: "ct" }],
    [454, "g", { qty: 454, unit: "g" }],
    [1, "kg", { qty: 1_000, unit: "g" }],
    [null, "oz", null],
    [12, null, null],
  ])("normalizes comparable unit-price size %s %s", (sizeQty, sizeUnit, expected) => {
    expect(toComparableSize(sizeQty, sizeUnit)).toEqual(expected);
  });
});
