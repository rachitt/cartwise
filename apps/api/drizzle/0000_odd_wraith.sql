CREATE TABLE "chains" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_product_id" uuid NOT NULL,
	"price" numeric NOT NULL,
	"promo_price" numeric,
	"captured_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"size_qty" numeric,
	"size_unit" text,
	"upc" text,
	"category" text,
	"image_url" text,
	CONSTRAINT "products_upc_unique" UNIQUE("upc")
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"external_product_id" text NOT NULL,
	CONSTRAINT "store_products_store_id_external_product_id_unique" UNIQUE("store_id","external_product_id")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_slug" text NOT NULL,
	"external_location_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"zip" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	CONSTRAINT "stores_chain_slug_external_location_id_unique" UNIQUE("chain_slug","external_location_id")
);
--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_store_product_id_store_products_id_fk" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_chain_slug_chains_slug_fk" FOREIGN KEY ("chain_slug") REFERENCES "public"."chains"("slug") ON DELETE no action ON UPDATE no action;