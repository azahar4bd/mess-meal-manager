ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "opening_due" numeric(14, 2) DEFAULT '0' NOT NULL;
