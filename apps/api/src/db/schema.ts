import {
  doublePrecision,
  boolean,
  index,
  integer,
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
  sizeQty: numeric("size_qty", { mode: "number" }),
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

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeProductId: uuid("store_product_id")
      .notNull()
      .references(() => storeProducts.id),
    price: numeric("price", { mode: "number" }).notNull(),
    promoPrice: numeric("promo_price", { mode: "number" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    index("price_snapshots_store_product_captured_at_idx").on(
      table.storeProductId,
      table.capturedAt.desc(),
    ),
  ],
);

export const priceCache = pgTable("price_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: text("device_id").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    qty: integer("qty").notNull().default(1),
  },
  (table) => [unique().on(table.cartId, table.productId)],
);

export const watches = pgTable(
  "watches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: text("device_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    storeIds: jsonb("store_ids").$type<string[]>().notNull(),
    baselinePrice: numeric("baseline_price", { mode: "number" }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.deviceId, table.productId)],
);

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  watchId: uuid("watch_id")
    .notNull()
    .references(() => watches.id),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  oldPrice: numeric("old_price", { mode: "number" }).notNull(),
  newPrice: numeric("new_price", { mode: "number" }).notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  read: boolean("read").notNull().default(false),
});

export const pushTokens = pgTable("push_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: text("device_id").notNull().unique(),
  expoPushToken: text("expo_push_token").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
