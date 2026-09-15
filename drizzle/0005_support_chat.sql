CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "at" timestamptz DEFAULT now() NOT NULL,
  "user_id" text DEFAULT '' NOT NULL,
  "user_name" text DEFAULT '' NOT NULL,
  "role" text DEFAULT '' NOT NULL,
  "office_id" text DEFAULT '' NOT NULL,
  "office_name" text DEFAULT '' NOT NULL,
  "sender" text DEFAULT 'user' NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "read" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_user_idx" ON "support_messages" ("user_id","at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_read_idx" ON "support_messages" ("read","sender");
