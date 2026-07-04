CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watch_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"old_price" numeric NOT NULL,
	"new_price" numeric NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"read" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"expo_push_token" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"store_ids" jsonb NOT NULL,
	"baseline_price" numeric NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watches_device_id_product_id_unique" UNIQUE("device_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watch_id_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;