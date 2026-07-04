import {
  doublePrecision,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const chains = pgTable("chains", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
});

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chainSlug: text("chain_slug")
      .notNull()
      .references(() => chains.slug),
    externalLocationId: text("external_location_id").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    zip: text("zip").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
  },
  (table) => [unique().on(table.chainSlug, table.externalLocationId)],
);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  brand: text("brand"),
  sizeQty: numeric("size_qty"),
  sizeUnit: text("size_unit"),
  upc: text("upc").unique(),
  category: text("category"),
  imageUrl: text("image_url"),
});

export const storeProducts = pgTable(
  "store_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    externalProductId: text("external_product_id").notNull(),
  },
  (table) => [unique().on(table.storeId, table.externalProductId)],
);

export const priceSnapshots = pgTable("price_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeProductId: uuid("store_product_id")
    .notNull()
    .references(() => storeProducts.id),
  price: numeric("price").notNull(),
  promoPrice: numeric("promo_price"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
});

export const priceCache = pgTable("price_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
