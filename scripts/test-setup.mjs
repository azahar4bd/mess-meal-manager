/**
 * Prepare a pristine demo database before the E2E suite runs.
 *
 * The suite mutates data on purpose (closes a month, opens the next one,
 * creates bazar/meal entries), so running it twice against the same database
 * would fail on the state-dependent assertions. This script restores the
 * seeded state first, which makes `npm run test` repeatable.
 *
 * SAFETY: it only ever touches the database from `.env.local` (the local dev
 * database), and only when the suite is pointed at localhost — or when
 * ALLOW_REMOTE_TEST_DB_RESET=1 is explicitly set. It never resets a remote
 * production database by accident.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const isLocal = /localhost|127\.0\.0\.1|\[::1\]/.test(new URL(BASE).hostname);
const allowRemote = process.env.ALLOW_REMOTE_TEST_DB_RESET === "1";

if (!isLocal && !allowRemote) {
  console.log(
    `· test-setup skipped — BASE_URL=${BASE} is not localhost.\n` +
      `  The E2E suite needs a seeded demo database; point BASE_URL at a local server,\n` +
      `  or set ALLOW_REMOTE_TEST_DB_RESET=1 to reset that remote database on purpose.`,
  );
  process.exit(0);
}

if (!fs.existsSync(path.join(ROOT, ".env.local"))) {
  console.log("· test-setup skipped — no .env.local found (nothing to reset locally).");
  process.exit(0);
}

function run(script) {
  execFileSync("npm", ["run", script], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    env: process.env,
  });
}

console.log(`· test-setup → restoring the demo database (${isLocal ? "localhost" : "REMOTE — explicitly allowed"})`);
try {
  run("db:reset");
} catch (err) {
  console.error("✗ db:reset failed — is PostgreSQL running? (npm run db:up)");
  process.exit(1);
}
try {
  run("db:migrate:sql");
} catch (err) {
  console.error("✗ db:migrate:sql failed");
  process.exit(1);
}
try {
  run("db:seed");
} catch (err) {
  console.error("✗ db:seed failed");
  process.exit(1);
}
console.log("· test-setup ✓ demo database restored\n");
