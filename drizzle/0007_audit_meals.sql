-- AM / Audit মিল — শুধু রেকর্ডের জন্য; কোনো হিসাব/শিট সিংকে যুক্ত নয়
CREATE TABLE IF NOT EXISTS "audit_meals" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"month_id" text NOT NULL,
	"day" integer NOT NULL,
	"date" date NOT NULL,
	"count" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_meals_month_day_uq" ON "audit_meals" ("month_id","day");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_meals_office_idx" ON "audit_meals" ("office_id");
--> statement-breakpoint
ALTER TABLE "audit_meals" ADD CONSTRAINT "audit_meals_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_meals" ADD CONSTRAINT "audit_meals_month_id_mess_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."mess_months"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
