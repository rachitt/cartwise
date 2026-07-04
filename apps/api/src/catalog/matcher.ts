import type { ChainSlug, StorePrice } from "@cartwise/shared";

import type { CollectedProduct } from "../collectors/types.js";
import type { CartwiseDb, ProductRow, StoreProductRow } from "../db/repository.js";
import { parseSize } from "./size.js";

export interface MatchedCollectedProduct {
  product: ProductRow;
  storeProduct: StoreProductRow;
  price: StorePrice | null;
}

export async function upsertCollectedProduct(
  db: CartwiseDb,
  collected: CollectedProduct,
  storeId: string,
  chain: ChainSlug,
): Promise<MatchedCollectedProduct> {
  const parsedSize = parseSize(collected.sizeRaw);
  const product =
    (collected.upc ? await db.findProductByUpc(collected.upc) : null) ??
    (await db.findProductByIdentity({
      name: collected.name,
      brand: normalizeNullable(collected.brand),
      sizeQty: parsedSize?.sizeQty ?? null,
      sizeUnit: parsedSize?.sizeUnit ?? null,
    })) ??
    (await db.insertProduct({
      name: collected.name.trim(),
      brand: normalizeNullable(collected.brand),
      sizeQty: parsedSize?.sizeQty ?? null,
      sizeUnit: parsedSize?.sizeUnit ?? null,
      upc: normalizeNullable(collected.upc),
      category: normalizeNullable(collected.category),
      imageUrl: normalizeNullable(collected.imageUrl),
    }));

  const storeProduct = await db.upsertStoreProduct(product.id, storeId, collected.externalProductId);
  const capturedAt = asDate(collected.capturedAt);

  if (collected.price === null) {
    return { product, storeProduct, price: null };
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
