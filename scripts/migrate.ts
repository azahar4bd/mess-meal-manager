/**
 * Apply every pending SQL migration in drizzle/ — works against ANY Postgres,
 * including a remote Neon database (the same code path the deployed app uses
 * via POST /api/migrations).
 *
 *   npm run db:migrate:sql                                  # uses .env.local
 *   DATABASE_URL="postgresql://…neon.tech/…?sslmode=require" npx tsx scripts/migrate.ts
 *
 * Idempotent: already-applied migrations are skipped (tracked in __migrations).
 */
import { runMigrations, readJournal } from "../src/lib/migrate";
import { closeDb, DB_DRIVER, IS_NEON } from "../src/db";

function masked(url: string): string {
  try {
    const u = new URL(url);
    u.password = u.password ? "•".repeat(Math.min(u.password.length, 8)) : "";
    return u.toString();
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

async function main() {
  const target = process.env.DATABASE_URL ?? "";
  const journal = readJournal();

  console.log("═══ Mess Meal Manager — SQL migrations ═══");
  console.log(`  driver   : ${DB_DRIVER} ${IS_NEON ? "(serverless websocket)" : "(tcp pool)"}`);
  console.log(`  database : ${masked(target)}`);
  console.log(`  journal  : ${journal.length} migration file(s) → ${journal.map((j) => j.tag).join(", ") || "none"}`);

  if (!target) {
    console.error("\n✗ DATABASE_URL সেট করা নেই। .env.local দেখুন বা এনভি ভেরিয়েবল হিসেবে দিন।");
    await closeDb();
    process.exit(1);
  }

  const started = Date.now();
  const result = await runMigrations();

  if (result.applied.length) console.log(`\n  ✓ applied : ${result.applied.join(", ")}`);
  if (result.skipped.length) console.log(`  · skipped : ${result.skipped.join(", ")} (already applied)`);
  if (result.failed) console.log(`\n  ✗ failed  : ${result.failed.tag}\n            ${result.failed.error}`);

  console.log(`\n  tables    : ${result.tables.length} ${result.tables.length ? `(${result.tables.join(", ")})` : ""}`);
  console.log(`  rows      : offices=${result.counts.offices} users=${result.counts.users} months=${result.counts.months}`);
  console.log(`  time      : ${Date.now() - started} ms`);
  console.log(`\n${result.ok ? "✓ " + result.message : "✗ " + result.message}`);

  if (result.ok && result.counts.offices === 0) {
    console.log(
      "\nপরবর্তী ধাপ:\n" +
        "  • ডেমো ডেটা চাইলে  → npm run db:seed\n" +
        "  • আসল ব্যবহার চাইলে → অ্যাপের /signup পেজে প্রথম অফিস খুলুন",
    );
  }

  await closeDb();
  process.exit(result.ok ? 0 : 1);
}

void main();
