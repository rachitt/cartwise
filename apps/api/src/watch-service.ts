import type { CartItemWithProduct, CartwiseDb, LatestProductStorePriceRow } from "./db/repository.js";

export async function upsertWatchesForFinalizedCart(
  db: CartwiseDb,
  deviceId: string,
  items: CartItemWithProduct[],
  storeIds: string[],
  latestRows: LatestProductStorePriceRow[],
  winningStoreId: string,
): Promise<void> {
  for (const item of items) {
    const baselinePrice = baselineForProduct(item.productId, latestRows, winningStoreId);
    if (baselinePrice === null) {
      continue;
    }

    await db.upsertWatch({
      deviceId,
      productId: item.productId,
      storeIds,
      baselinePrice,
    });
  }
}

function baselineForProduct(
  productId: string,
  rows: LatestProductStorePriceRow[],
  winningStoreId: string,
): number | null {
  const productRows = rows.filter(
    (row) => row.productId === productId && row.price !== null && row.price.price !== null,
  );
  const winningRow = productRows.find((row) => row.storeId === winningStoreId);
  if (winningRow?.price) {
    return effectivePrice(winningRow.price);
  }

  const cheapest = productRows
    .map((row) => (row.price ? effectivePrice(row.price) : null))
    .filter((price): price is number => price !== null)
    .sort((left, right) => left - right)[0];

  return cheapest ?? null;
}

function effectivePrice(price: { price: number | null; promoPrice: number | null }): number {
  return price.promoPrice ?? price.price ?? Number.POSITIVE_INFINITY;
}
