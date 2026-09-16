ALTER TABLE "extra_expenses" ADD COLUMN IF NOT EXISTS "paid_by_member_id" text DEFAULT '' NOT NULL;
