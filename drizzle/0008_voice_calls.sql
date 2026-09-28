-- Voice calls — WebRTC signaling (office isolated)
CREATE TABLE IF NOT EXISTS "voice_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text DEFAULT '' NOT NULL,
	"caller_id" text NOT NULL,
	"caller_name" text DEFAULT '' NOT NULL,
	"caller_user_id" text DEFAULT '' NOT NULL,
	"callee_id" text NOT NULL,
	"callee_name" text DEFAULT '' NOT NULL,
	"callee_user_id" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ringing' NOT NULL,
	"offer" text DEFAULT '' NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"caller_candidates" text DEFAULT '[]' NOT NULL,
	"callee_candidates" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_caller_idx" ON "voice_calls" ("caller_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_callee_idx" ON "voice_calls" ("callee_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_office_idx" ON "voice_calls" ("office_id","created_at");
