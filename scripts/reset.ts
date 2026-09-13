/**
 * Drop every table and re-create the schema from scratch.
 * ⚠ DANGEROUS — this deletes all data. Development use only.
 *
 * Run: npm run db:reset   (then: npm run db:push && npm run db:seed)
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";

const TABLES = [
  "__migrations",
  "audit_logs",
  "sync_logs",
  "extra_expenses",
  "other_incomes",
  "deposits",
  "bazar_expenses",
  "daily_meals",
  "members",
  "mess_months",
  "sessions",
  "users",
  "offices",
  "settings",
];

async function main() {
  console.log("⚠ Dropping all Mess Meal Manager tables…");
  for (const t of TABLES) {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "${t}" CASCADE`));
    console.log(`  - dropped ${t}`);
  }
  await db.execute(sql.raw(`DROP TYPE IF EXISTS role CASCADE`));
  await db.execute(sql.raw(`DROP TYPE IF EXISTS user_status CASCADE`));
  await db.execute(sql.raw(`DROP TYPE IF EXISTS office_status CASCADE`));
  await db.execute(sql.raw(`DROP TYPE IF EXISTS bazar_category CASCADE`));
  await db.execute(sql.raw(`DROP TYPE IF EXISTS extra_type CASCADE`));
  console.log("✓ Reset complete. Run: npm run db:push && npm run db:seed");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Reset failed:", err);
  process.exit(1);
});
