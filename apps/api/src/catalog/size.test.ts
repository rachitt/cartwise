import { describe, expect, it } from "vitest";

import { parseSize } from "./size.js";

describe("parseSize", () => {
  it.each([
    ["12 oz", { sizeQty: 12, sizeUnit: "oz" }],
    ["1 gal", { sizeQty: 1, sizeUnit: "gal" }],
    ["16.9 fl oz", { sizeQty: 16.9, sizeUnit: "floz" }],
    ["6 ct", { sizeQty: 6, sizeUnit: "ct" }],
    ["2 lb", { sizeQty: 2, sizeUnit: "lb" }],
    ["500 ml", { sizeQty: 500, sizeUnit: "ml" }],
    ["3 pounds", { sizeQty: 3, sizeUnit: "lb" }],
    ["24 count", { sizeQty: 24, sizeUnit: "ct" }],
    ["1.5 liters", { sizeQty: 1.5, sizeUnit: "l" }],
    ["454 g", { sizeQty: 454, sizeUnit: "g" }],
    [" 8   ounces ", { sizeQty: 8, sizeUnit: "oz" }],
    ["12 oz bottle", { sizeQty: 12, sizeUnit: "oz" }],
    ["6 ct bag", { sizeQty: 6, sizeUnit: "ct" }],
    ["not a size", null],
    ["", null],
    [null, null],
  ])("parses %s", (sizeRaw, expected) => {
    expect(parseSize(sizeRaw)).toEqual(expected);
  });
});
