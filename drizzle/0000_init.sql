CREATE TYPE "public"."bazar_category" AS ENUM('Groceries', 'Vegetables', 'Meat', 'Fish', 'Rice', 'Oil', 'Spices', 'Other');--> statement-breakpoint
CREATE TYPE "public"."extra_type" AS ENUM('shared', 'individual');--> statement-breakpoint
CREATE TYPE "public"."office_status" AS ENUM('pending', 'approved', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'manager', 'member', 'audit');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'approved', 'rejected', 'inactive', 'active');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	"user_name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"office_id" text DEFAULT '' NOT NULL,
	"month_id" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"entity" text DEFAULT '' NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"meta" jsonb,
	"ip" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bazar_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"month_id" text NOT NULL,
	"date" date NOT NULL,
	"day" integer NOT NULL,
	"member_id" text,
	"buyer_name" text DEFAULT '' NOT NULL,
	"category" "bazar_category" DEFAULT 'Groceries' NOT NULL,
	"items" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_meals" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"month_id" text NOT NULL,
	"member_id" text NOT NULL,
	"day" integer NOT NULL,
	"date" date NOT NULL,
	"meals" numeric(10, 2) DEFAULT '0' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"month_id" text NOT NULL,
	"date" date NOT NULL,
	"day" integer NOT NULL,
	"member_id" text,
	"member_name" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'permanent_fund' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extra_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"month_id" text NOT NULL,
	"date" date NOT NULL,
	"day" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"type" "extra_type" DEFAULT 'shared' NOT NULL,
	"member_id" text,
	"member_name" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"month_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"password" text DEFAULT '' NOT NULL,
	"room" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mess_months" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"month_name" text NOT NULL,
	"total_days" integer NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"carry_forward_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"manager_name" text DEFAULT '' NOT NULL,
	"manager_email" text DEFAULT '' NOT NULL,
	"manager_phone" text DEFAULT '' NOT NULL,
	"status" "office_status" DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sheet_url" text DEFAULT '' NOT NULL,
	"sheet_id" text DEFAULT '' NOT NULL,
	"script_url" text DEFAULT '' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"address" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "other_incomes" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"month_id" text NOT NULL,
	"date" date NOT NULL,
	"day" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" "role" NOT NULL,
	"office_id" text,
	"current_office_id" text,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"office_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"month_id" text DEFAULT '' NOT NULL,
	"action" text DEFAULT 'sync' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"ok" boolean DEFAULT false NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"sheet_url" text DEFAULT '' NOT NULL,
	"sheet_id" text DEFAULT '' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"payload_size" integer DEFAULT 0 NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"branch" text DEFAULT '' NOT NULL,
	"office_id" text,
	"role" "role" DEFAULT 'member' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"password" text NOT NULL,
	"last_login" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bazar_expenses" ADD CONSTRAINT "bazar_expenses_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bazar_expenses" ADD CONSTRAINT "bazar_expenses_month_id_mess_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."mess_months"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_meals" ADD CONSTRAINT "daily_meals_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_meals" ADD CONSTRAINT "daily_meals_month_id_mess_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."mess_months"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_meals" ADD CONSTRAINT "daily_meals_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_month_id_mess_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."mess_months"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_expenses" ADD CONSTRAINT "extra_expenses_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_expenses" ADD CONSTRAINT "extra_expenses_month_id_mess_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."mess_months"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_expenses" ADD CONSTRAINT "extra_expenses_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_month_id_mess_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."mess_months"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mess_months" ADD CONSTRAINT "mess_months_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_incomes" ADD CONSTRAINT "other_incomes_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_incomes" ADD CONSTRAINT "other_incomes_month_id_mess_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."mess_months"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_office_idx" ON "audit_logs" USING btree ("office_id","at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bazar_month_idx" ON "bazar_expenses" USING btree ("month_id");--> statement-breakpoint
CREATE INDEX "bazar_month_date_idx" ON "bazar_expenses" USING btree ("month_id","date");--> statement-breakpoint
CREATE INDEX "bazar_office_idx" ON "bazar_expenses" USING btree ("office_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_meals_month_member_day_uq" ON "daily_meals" USING btree ("month_id","member_id","day");--> statement-breakpoint
CREATE INDEX "daily_meals_month_day_idx" ON "daily_meals" USING btree ("month_id","day");--> statement-breakpoint
CREATE INDEX "daily_meals_office_idx" ON "daily_meals" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "deposits_month_idx" ON "deposits" USING btree ("month_id");--> statement-breakpoint
CREATE INDEX "deposits_member_idx" ON "deposits" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "deposits_office_idx" ON "deposits" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "extra_month_idx" ON "extra_expenses" USING btree ("month_id");--> statement-breakpoint
CREATE INDEX "extra_office_idx" ON "extra_expenses" USING btree ("office_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_month_phone_uq" ON "members" USING btree ("month_id","phone");--> statement-breakpoint
CREATE INDEX "members_office_idx" ON "members" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "members_month_idx" ON "members" USING btree ("month_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mess_months_office_year_month_uq" ON "mess_months" USING btree ("office_id","year","month");--> statement-breakpoint
CREATE INDEX "mess_months_office_idx" ON "mess_months" USING btree ("office_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offices_code_uq" ON "offices" USING btree ("code");--> statement-breakpoint
CREATE INDEX "offices_status_idx" ON "offices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "income_month_idx" ON "other_incomes" USING btree ("month_id");--> statement-breakpoint
CREATE INDEX "income_office_idx" ON "other_incomes" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sync_logs_office_idx" ON "sync_logs" USING btree ("office_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_user_id_uq" ON "users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_office_idx" ON "users" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");