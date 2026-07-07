import type { Product, ProductComparison } from "@cartwise/shared";

import {
  normalizeSearchText,
  SEARCH_STOP_WORDS,
  tokenizeSearchText,
} from "../search/relevance.js";
import { toComparableSize } from "./size.js";

type ComparableProduct = Pick<
  Product,
  "brand" | "category" | "name" | "sizeQty" | "sizeUnit" | "upc"
>;

const MIN_SIZE_RATIO = 0.9;
const MAX_SIZE_RATIO = 1.1;
const STRONG_SIZE_RATIO = 0.98;
const EQUIVALENT_CONFIDENCE = 0.75;
const COMPARABLE_CONFIDENCE = 0.6;
const SIZE_UNIT_TOKENS = new Set([
  "count",
  "ct",
  "each",
  "ea",
  "fl",
  "floz",
  "fluid",
  "gal",
  "gallon",
  "gram",
  "kg",
  "kilogram",
  "lb",
  "lbs",
  "liter",
  "milliliter",
  "ml",
  "ounce",
  "oz",
  "pint",
  "pt",
  "quart",
  "qt",
]);

export function compareProducts(a: ComparableProduct, b: ComparableProduct): ProductComparison {
  if (a.upc !== null && b.upc !== null && a.upc === b.upc) {
    return { tier: "exact", confidence: 1, reasons: ["upc"] };
  }

  const sizeA = toComparableSize(a.sizeQty, a.sizeUnit);
  const sizeB = toComparableSize(b.sizeQty, b.sizeUnit);

  if (!sizeA || !sizeB) {
    return { tier: "none", confidence: 0, reasons: ["size-unparseable"] };
  }

  if (sizeA.unit !== sizeB.unit) {
    return { tier: "none", confidence: 0, reasons: ["size-unit-mismatch"] };
  }

  const sizeRatio = Math.min(sizeA.qty, sizeB.qty) / Math.max(sizeA.qty, sizeB.qty);
  if (sizeRatio < MIN_SIZE_RATIO || sizeRatio > MAX_SIZE_RATIO) {
    return { tier: "none", confidence: 0, reasons: ["size-ratio-mismatch"] };
  }

  const categoryEqual = normalizedNullable(a.category) !== null && normalizedNullable(a.category) === normalizedNullable(b.category);
  const sizeScore = sizeRatio >= STRONG_SIZE_RATIO ? 1 : 0.8;
  const nameTokenJaccard = compareNameTokens(a, b);
  const confidence = 0.2 * Number(categoryEqual) + 0.45 * sizeScore + 0.35 * nameTokenJaccard;
  const brandsEqual = normalizedNullable(a.brand) !== null && normalizedNullable(a.brand) === normalizedNullable(b.brand);
  const reasons = [
    categoryEqual ? "category-match" : "category-mismatch",
    `size-ratio:${formatScore(sizeRatio)}`,
    `name-jaccard:${formatScore(nameTokenJaccard)}`,
  ];

  if (brandsEqual && confidence >= EQUIVALENT_CONFIDENCE) {
    return { tier: "equivalent", confidence, reasons: ["brand-match", ...reasons] };
  }

  if (confidence >= COMPARABLE_CONFIDENCE) {
    return { tier: "comparable", confidence, reasons };
  }

  return { tier: "none", confidence, reasons: ["low-confidence", ...reasons] };
}

function compareNameTokens(a: ComparableProduct, b: ComparableProduct): number {
  const excludedTokens = new Set([
    ...tokenizeSearchText(a.brand ?? ""),
    ...tokenizeSearchText(b.brand ?? ""),
    ...sizeTokens(a),
    ...sizeTokens(b),
    ...SEARCH_STOP_WORDS,
  ]);
  const tokensA = productNameTokenSet(a.name, excludedTokens);
  const tokensB = productNameTokenSet(b.name, excludedTokens);

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 1;
  }

  const intersection = [...tokensA].filter((token) => tokensB.has(token)).length;
  const union = new Set([...tokensA, ...tokensB]).size;

  return union === 0 ? 0 : intersection / union;
}

function productNameTokenSet(name: string, excludedTokens: Set<string>): Set<string> {
  return new Set(tokenizeSearchText(name).filter((token) => !excludedTokens.has(token)));
}

function sizeTokens(product: ComparableProduct): string[] {
  const qtyTokens = product.sizeQty === null ? [] : tokenizeSearchText(String(product.sizeQty));
  const unitTokens = product.sizeUnit === null ? [] : tokenizeSearchText(product.sizeUnit);
  const compoundTokens =
    product.sizeQty === null || product.sizeUnit === null
      ? []
      : tokenizeSearchText(`${product.sizeQty}${product.sizeUnit}`);

  return [...qtyTokens, ...unitTokens, ...compoundTokens, ...SIZE_UNIT_TOKENS];
}

function normalizedNullable(value: string | null): string | null {
  const normalized = value ? normalizeSearchText(value) : "";
  return normalized.length > 0 ? normalized : null;
}

function formatScore(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
