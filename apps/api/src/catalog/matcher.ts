import type { ChainSlug, ProductMatch, StorePrice } from "@cartwise/shared";

import type { CollectedProduct } from "../collectors/types.js";
import type { CartwiseDb, ProductRow, StoreProductRow } from "../db/repository.js";
import { parseSize } from "./size.js";

export interface MatchedCollectedProduct {
  product: ProductRow;
  storeProduct: StoreProductRow;
  price: StorePrice | null;
  match: ProductMatch;
}

export async function upsertCollectedProduct(
  db: CartwiseDb,
  collected: CollectedProduct,
  storeId: string,
  chain: ChainSlug,
): Promise<MatchedCollectedProduct> {
  const parsedSize = parseSize(collected.sizeRaw);
  const normalizedUpc = normalizeNullable(collected.upc);
  const identity = {
    name: collected.name,
    brand: normalizeNullable(collected.brand),
    sizeQty: parsedSize?.sizeQty ?? null,
    sizeUnit: parsedSize?.sizeUnit ?? null,
  };
  const upcProduct = normalizedUpc ? await db.findProductByUpc(normalizedUpc) : null;
  const identityCandidate = upcProduct ? null : await db.findProductByIdentity(identity);
  const acceptsIdentityMatch =
    identityCandidate !== null &&
    (identity.brand !== null || (await db.productHasStoreProductForChain(identityCandidate.id, chain)));
  const identityProduct = acceptsIdentityMatch ? identityCandidate : null;
  const shouldInsertDistinctProduct = identityCandidate !== null && !acceptsIdentityMatch;
  const match: ProductMatch = upcProduct
    ? { confidence: "exact", method: "upc" }
    : identityProduct
      ? { confidence: "exact", method: "identity" }
      : { confidence: "new", method: "inserted" };
  const product =
    upcProduct ??
    identityProduct ??
    (await db.insertProduct({
      name: collected.name.trim(),
      brand: identity.brand,
      sizeQty: identity.sizeQty,
      sizeUnit: identity.sizeUnit,
      upc: normalizedUpc,
      category: normalizeNullable(collected.category),
      imageUrl: normalizeNullable(collected.imageUrl),
    }, { skipIdentityMerge: shouldInsertDistinctProduct }));

  const storeProduct = await db.upsertStoreProduct(product.id, storeId, collected.externalProductId);
  const capturedAt = asDate(collected.capturedAt);

  if (collected.price === null) {
    return { product, storeProduct, price: null, match };
  }

  await db.insertPriceSnapshot({
    storeProductId: storeProduct.id,
    price: collected.price,
    promoPrice: collected.promoPrice,
    capturedAt,
    source: chain,
  });

  return {
    product,
    storeProduct,
    match,
    price: {
      storeId,
      productId: product.id,
      price: collected.price,
      promoPrice: collected.promoPrice,
      capturedAt: capturedAt.toISOString(),
      source: chain,
    },
  };
}

function normalizeNullable(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function asDate(value: Date): Date {
  return value instanceof Date ? value : new Date(value);
}
