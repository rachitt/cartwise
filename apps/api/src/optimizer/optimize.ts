import {
  type CartBillLine,
  MIN_SWAP_CONFIDENCE,
  type CartOptimization,
  type MatchTier,
  type Product,
  type ProductComparison,
  type Store,
  type StorePrice,
  type SwapSuggestion,
} from "@cartwise/shared";

import { toComparableSize } from "../catalog/size.js";

export interface OptimizerInput {
  items: Array<{ productId: string; qty: number }>;
  prices: StorePrice[];
  stores: Store[];
  alternatives: Record<string, Array<{ product: Product; prices: StorePrice[]; comparison?: ProductComparison }>>;
}

export class OptimizerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptimizerError";
  }
}

interface StoreCandidate {
  store: Store;
  totalCents: number;
  missingItems: string[];
  lines: CartBillLine[];
  usedPrices: StorePrice[];
}

interface BillLineCandidate {
  line: CartBillLine;
  lineTotalCents: number;
  price: StorePrice;
  tier: MatchTier;
}

const CHEAPER_ELSEWHERE_MIN_CENTS = 30;
const CHEAPER_ELSEWHERE_MIN_RATIO = 0.05;
const SWAP_MIN_LINE_SAVINGS_CENTS = 50;
const MIN_COVERAGE = 0.7;

export function optimizeCart(input: OptimizerInput): CartOptimization {
  const items = input.items.filter((item) => item.qty > 0);

  if (items.length === 0) {
    throw new OptimizerError("Cart is empty");
  }

  const priceIndex = indexPrices(input.prices);
  const candidates = input.stores.map((store) =>
    buildStoreCandidate(store, items, priceIndex, input.alternatives),
  );
  const winningPool = candidates.filter((candidate) => coverage(candidate, items.length) >= MIN_COVERAGE);
  const eligibleCandidates = winningPool.length > 0 ? winningPool : highestCoverageCandidates(candidates, items.length);

  if (eligibleCandidates.length === 0) {
    throw new OptimizerError("No selected stores");
  }

  const winningCandidate = [...eligibleCandidates].sort(compareStoreCandidates)[0];
  const worstTotalCents = Math.max(...candidates.map((candidate) => candidate.totalCents));
  const savingsCents = Math.max(0, worstTotalCents - winningCandidate.totalCents);

  return {
    winningStoreId: winningCandidate.store.id,
    winningTotal: centsToMoney(winningCandidate.totalCents),
    worstTotal: centsToMoney(worstTotalCents),
    savings: centsToMoney(savingsCents),
    perStoreTotals: candidates.map((candidate) => ({
      storeId: candidate.store.id,
      total: centsToMoney(candidate.totalCents),
      missingItems: candidate.missingItems,
      lines: candidate.lines,
      pricesAsOf: oldestCapturedAt(candidate.usedPrices),
      coveredItemCount: candidate.lines.length,
      itemCount: items.length,
      substitutionCount: candidate.lines.filter((line) => line.substitutedProductId !== undefined).length,
    })),
    cheaperElsewhere: buildCheaperElsewhere(items, input.stores, winningCandidate.store.id, priceIndex),
    swapSuggestions: buildSwapSuggestions(items, winningCandidate.store.id, priceIndex, input.alternatives),
    pricesAsOf: oldestCapturedAt(winningCandidate.usedPrices),
  };
}

function buildStoreCandidate(
  store: Store,
  items: Array<{ productId: string; qty: number }>,
  priceIndex: Map<string, StorePrice>,
  alternatives: OptimizerInput["alternatives"],
): StoreCandidate {
  let totalCents = 0;
  const missingItems: string[] = [];
  const lines: CartBillLine[] = [];
  const usedPrices: StorePrice[] = [];

  for (const item of items) {
    const line = buildBillLine(store.id, item, priceIndex, alternatives[item.productId] ?? []);
    if (!line) {
      missingItems.push(item.productId);
      continue;
    }

    totalCents += line.lineTotalCents;
    lines.push(line.line);
    usedPrices.push(line.price);
  }

  return { store, totalCents, missingItems, lines, usedPrices };
}

function buildBillLine(
  storeId: string,
  item: { productId: string; qty: number },
  priceIndex: Map<string, StorePrice>,
  alternatives: OptimizerInput["alternatives"][string],
): BillLineCandidate | null {
  const directPrice = priceIndex.get(priceKey(item.productId, storeId));
  const directLine = directPrice
    ? toBillLineCandidate(item, directPrice, "exact")
    : null;
  if (directLine) {
    return directLine;
  }

  const equivalentLine = bestAlternativeLine(
    storeId,
    item,
    alternatives,
    new Set<MatchTier>(["exact", "equivalent"]),
    false,
  );
  if (equivalentLine) {
    return equivalentLine;
  }

  return bestAlternativeLine(
    storeId,
    item,
    alternatives,
    new Set<MatchTier>(["comparable"]),
    true,
  );
}

function bestAlternativeLine(
  storeId: string,
  item: { productId: string; qty: number },
  alternatives: OptimizerInput["alternatives"][string],
  allowedTiers: ReadonlySet<MatchTier>,
  isSubstitution: boolean,
): BillLineCandidate | null {
  let best: BillLineCandidate | null = null;

  for (const alternative of alternatives) {
    if (alternative.product.id === item.productId) {
      continue;
    }

    if (
      !alternative.comparison ||
      !allowedTiers.has(alternative.comparison.tier) ||
      alternative.comparison.tier === "none" ||
      alternative.comparison.confidence < MIN_SWAP_CONFIDENCE
    ) {
      continue;
    }

    const price = alternative.prices.find((candidatePrice) => candidatePrice.storeId === storeId);
    const line = price
      ? toBillLineCandidate(
          item,
          price,
          alternative.comparison.tier,
          isSubstitution ? alternative.product.id : undefined,
          isSubstitution ? alternative.product.name : undefined,
        )
      : null;
    if (!line) {
      continue;
    }

    if (!best || compareBillLineCandidates(line, best) < 0) {
      best = line;
    }
  }

  return best;
}

function toBillLineCandidate(
  item: { productId: string; qty: number },
  price: StorePrice,
  tier: MatchTier,
  substitutedProductId?: string,
  substitutedProductName?: string,
): BillLineCandidate | null {
  const priceValue = effectivePrice(price);
  if (priceValue === null) {
    return null;
  }

  const unitPriceCents = moneyToCents(priceValue);
  const lineTotalCents = unitPriceCents * item.qty;

  return {
    line: {
      productId: item.productId,
      ...(substitutedProductId ? { substitutedProductId } : {}),
      ...(substitutedProductName ? { substitutedProductName } : {}),
      qty: item.qty,
      unitPrice: centsToMoney(unitPriceCents),
      lineTotal: centsToMoney(lineTotalCents),
      capturedAt: price.capturedAt,
    },
    lineTotalCents,
    price,
    tier,
  };
}

function compareBillLineCandidates(left: BillLineCandidate, right: BillLineCandidate): number {
  return (
    tierRank(left.tier) - tierRank(right.tier) ||
    left.lineTotalCents - right.lineTotalCents ||
    (left.line.substitutedProductId ?? left.line.productId).localeCompare(
      right.line.substitutedProductId ?? right.line.productId,
    )
  );
}

function tierRank(tier: MatchTier): number {
  switch (tier) {
    case "exact":
      return 0;
    case "equivalent":
      return 1;
    case "comparable":
      return 2;
    case "none":
      return 3;
  }
}

function compareStoreCandidates(left: StoreCandidate, right: StoreCandidate): number {
  return (
    left.totalCents - right.totalCents ||
    left.missingItems.length - right.missingItems.length ||
    left.store.name.localeCompare(right.store.name)
  );
}

function coverage(candidate: StoreCandidate, itemCount: number): number {
  return (itemCount - candidate.missingItems.length) / itemCount;
}

function highestCoverageCandidates(
  candidates: StoreCandidate[],
  itemCount: number,
): StoreCandidate[] {
  const highestCoverage = Math.max(...candidates.map((candidate) => coverage(candidate, itemCount)));
  return candidates.filter((candidate) => coverage(candidate, itemCount) === highestCoverage);
}

function buildCheaperElsewhere(
  items: Array<{ productId: string; qty: number }>,
  stores: Store[],
  winningStoreId: string,
  priceIndex: Map<string, StorePrice>,
): CartOptimization["cheaperElsewhere"] {
  const flags: CartOptimization["cheaperElsewhere"] = [];

  for (const item of items) {
    const winningPrice = priceIndex.get(priceKey(item.productId, winningStoreId));
    if (!winningPrice) {
      continue;
    }

    const winningPriceValue = effectivePrice(winningPrice);
    if (winningPriceValue === null) {
      continue;
    }

    const winningPriceCents = moneyToCents(winningPriceValue);
    let best:
      | {
          storeId: string;
          priceCents: number;
          deltaCents: number;
        }
      | null = null;

    for (const store of stores) {
      if (store.id === winningStoreId) {
        continue;
      }

      const price = priceIndex.get(priceKey(item.productId, store.id));
      if (!price) {
        continue;
      }

      const priceValue = effectivePrice(price);
      if (priceValue === null) {
        continue;
      }

      const priceCents = moneyToCents(priceValue);
      const deltaCents = winningPriceCents - priceCents;
      const deltaRatio = winningPriceCents === 0 ? 0 : deltaCents / winningPriceCents;

      if (deltaCents < CHEAPER_ELSEWHERE_MIN_CENTS || deltaRatio < CHEAPER_ELSEWHERE_MIN_RATIO) {
        continue;
      }

      if (!best || deltaCents > best.deltaCents || (deltaCents === best.deltaCents && store.id < best.storeId)) {
        best = { storeId: store.id, priceCents, deltaCents };
      }
    }

    if (best) {
      flags.push({
        productId: item.productId,
        storeId: best.storeId,
        price: centsToMoney(best.priceCents),
        delta: centsToMoney(best.deltaCents),
      });
    }
  }

  return flags;
}

function buildSwapSuggestions(
  items: Array<{ productId: string; qty: number }>,
  winningStoreId: string,
  priceIndex: Map<string, StorePrice>,
  alternatives: OptimizerInput["alternatives"],
): SwapSuggestion[] {
  const suggestions: SwapSuggestion[] = [];

  for (const item of items) {
    const original = alternatives[item.productId]?.find(
      (alternative) => alternative.product.id === item.productId,
    )?.product;
    const originalPrice = priceIndex.get(priceKey(item.productId, winningStoreId));

    if (!original || !originalPrice) {
      continue;
    }

    const originalSize = toComparableSize(original.sizeQty, original.sizeUnit);
    const originalPriceValue = effectivePrice(originalPrice);
    if (!originalSize || originalPriceValue === null) {
      continue;
    }

    const originalUnitPrice = moneyToCents(originalPriceValue) / originalSize.qty;
    let best:
      | {
        toProductId: string;
        savingsCents: number;
        reason: SwapSuggestion["reason"];
        matchTier: SwapSuggestion["matchTier"];
        matchConfidence: number;
      }
    | null = null;

    for (const alternative of alternatives[item.productId] ?? []) {
      if (alternative.product.id === item.productId) {
        continue;
      }

      if (
        !alternative.comparison ||
        alternative.comparison.tier === "none" ||
        alternative.comparison.confidence < MIN_SWAP_CONFIDENCE
      ) {
        continue;
      }

      const alternativePrice = alternative.prices.find((price) => price.storeId === winningStoreId);
      if (!alternativePrice) {
        continue;
      }

      const alternativeSize = toComparableSize(alternative.product.sizeQty, alternative.product.sizeUnit);
      const alternativePriceValue = effectivePrice(alternativePrice);
      if (
        !alternativeSize ||
        alternativeSize.unit !== originalSize.unit ||
        alternativePriceValue === null
      ) {
        continue;
      }

      const alternativeUnitPrice = moneyToCents(alternativePriceValue) / alternativeSize.qty;
      const savingsCents = Math.round((originalUnitPrice - alternativeUnitPrice) * originalSize.qty * item.qty);

      if (savingsCents < SWAP_MIN_LINE_SAVINGS_CENTS) {
        continue;
      }

      const reason = brandsDiffer(original.brand, alternative.product.brand)
        ? "cheaper-brand"
        : "better-unit-price";

      if (
        !best ||
        savingsCents > best.savingsCents ||
        (savingsCents === best.savingsCents && alternative.product.id < best.toProductId)
      ) {
        best = {
          toProductId: alternative.product.id,
          savingsCents,
          reason,
          matchTier: alternative.comparison.tier,
          matchConfidence: alternative.comparison.confidence,
        };
      }
    }

    if (best) {
      suggestions.push({
        fromProductId: item.productId,
        toProductId: best.toProductId,
        savings: centsToMoney(best.savingsCents),
        reason: best.reason,
        matchTier: best.matchTier,
        matchConfidence: best.matchConfidence,
      });
    }
  }

  return suggestions;
}

function indexPrices(prices: StorePrice[]): Map<string, StorePrice> {
  const index = new Map<string, StorePrice>();

  for (const price of prices) {
    if (effectivePrice(price) === null) {
      continue;
    }

    const key = priceKey(price.productId, price.storeId);
    const existing = index.get(key);

    if (!existing || new Date(price.capturedAt).getTime() > new Date(existing.capturedAt).getTime()) {
      index.set(key, price);
    }
  }

  return index;
}

function oldestCapturedAt(prices: StorePrice[]): string {
  if (prices.length === 0) {
    return new Date(0).toISOString();
  }

  return prices
    .map((price) => price.capturedAt)
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0];
}

function effectivePrice(price: StorePrice): number | null {
  return price.promoPrice ?? price.price ?? null;
}

function moneyToCents(value: number): number {
  return Math.round(value * 100);
}

function centsToMoney(cents: number): number {
  return cents / 100;
}

function priceKey(productId: string, storeId: string): string {
  return `${productId}:${storeId}`;
}

function brandsDiffer(left: string | null, right: string | null): boolean {
  return normalizeBrand(left) !== normalizeBrand(right);
}

function normalizeBrand(value: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}
