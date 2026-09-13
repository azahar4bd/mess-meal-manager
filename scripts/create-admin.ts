/**
 * Create (or repair) the PLATFORM ADMIN — the only role that can see every
 * office, switch between them and manage offices/users.
 *
 * Why this exists: on a brand-new deployment the database is empty, and
 * `/signup` creates a *manager* for one office — not a platform admin. Without
 * an admin nobody can manage multiple offices. This script fills that gap.
 *
 * Idempotent: if the userId already exists it is upgraded to admin/active and
 * the password is re-hashed, so it doubles as a "I lost admin access" recovery
 * tool.
 *
 * Usage:
 *   # local database (.env.local)
 *   npm run admin:create -- --userId=01700000000 --password='স্ট্রং-পাসওয়ার্ড' --name='Platform Admin'
 *
 *   # a remote database (e.g. Neon) — pass the URL explicitly
 *   DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require" \
 *     npx tsx scripts/create-admin.ts --userId=01700000000 --password='…'
 *
 *   # or use environment variables instead of flags
 *   SEED_ADMIN_USER_ID=… SEED_ADMIN_PASSWORD=… SEED_ADMIN_NAME=… npx tsx scripts/create-admin.ts
 */
import { eq } from "drizzle-orm";
import { db, closeDb, DB_DRIVER, IS_NEON } from "../src/db";
import { users } from "../src/db/schema";
import { createUser } from "../src/lib/service";
import { hashPassword } from "../src/lib/password";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function mask(value: string): string {
  if (!value) return "(empty)";
  return value.length <= 3 ? "•".repeat(value.length) : `${value[0]}${"•".repeat(Math.min(value.length - 2, 10))}${value[value.length - 1]}`;
}

function maskedUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "(DATABASE_URL নেই → src/db-এর লোকাল ফলব্যাক ব্যবহার হচ্ছে)";
  try {
    const u = new URL(url);
    u.password = u.password ? "•".repeat(Math.min(u.password.length, 10)) : "";
    return u.toString();
  } catch {
    return "(DATABASE_URL পার্স করা যাচ্ছে না)";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const userId = (args.userId ?? process.env.SEED_ADMIN_USER_ID ?? "").trim();
  const password = args.password ?? process.env.SEED_ADMIN_PASSWORD ?? "";
  const name = (args.name ?? process.env.SEED_ADMIN_NAME ?? "Platform Admin").trim();
  const email = (args.email ?? "").trim().toLowerCase();
  const phone = (args.phone ?? (userId.length >= 11 ? userId : "")).trim();

  console.log("═══ Mess Meal Manager — platform admin ═══");
  console.log(`  driver   : ${DB_DRIVER} ${IS_NEON ? "(serverless websocket)" : "(tcp pool)"}`);
  console.log(`  database : ${maskedUrl()}`);

  if (!userId) {
    console.error("\n✗ --userId দরকার (যেমন আপনার মোবাইল নম্বর)। উদাহরণ:");
    console.error("   npx tsx scripts/create-admin.ts --userId=01700000000 --password='আপনার-পাসওয়ার্ড' --name='Platform Admin'");
    await closeDb();
    process.exit(1);
  }
  if (password.length < 4) {
    console.error("\n✗ --password কমপক্ষে ৪ অক্ষরের হতে হবে (প্রোডাকশনে ১২+ অক্ষরের শক্তিশালী পাসওয়ার্ড দিন)।");
    await closeDb();
    process.exit(1);
  }

  const existing = await db.select().from(users).where(eq(users.userId, userId)).limit(1);

  if (existing[0]) {
    const u = existing[0]!;
    const updated = await db
      .update(users)
      .set({
        name: name || u.name,
        email: email || u.email,
        phone: phone || u.phone,
        role: "admin",
        status: "active",
        officeId: null, // a platform admin is not tied to one office
        password: hashPassword(password),
        updatedAt: new Date(),
      })
      .where(eq(users.id, u.id))
      .returning();
    const row = updated[0]!;
    console.log("\n  ✓ existing user upgraded to platform admin");
    console.log(`    id       : ${row.id}`);
    console.log(`    userId   : ${row.userId}`);
    console.log(`    name     : ${row.name}`);
    console.log(`    role     : ${row.role} | status: ${row.status} | officeId: ${row.officeId ?? "null (all offices)"}`);
    console.log(`    password : ${mask(password)} → re-hashed with bcrypt`);
    console.log("    note     : পুরনো সেশনগুলো বাতিল করা হলো না; নিরাপত্তার জন্য অ্যাডমিনকে আবার লগইন করতে বলুন।");
  } else {
    const created = await createUser({
      userId,
      name: name || userId,
      email,
      phone,
      branch: "",
      officeId: null,
      role: "admin",
      status: "active",
      password,
    });
    console.log("\n  ✓ platform admin created");
    console.log(`    id       : ${created.id}`);
    console.log(`    userId   : ${created.userId}`);
    console.log(`    name     : ${created.name}`);
    console.log(`    role     : ${created.role} | status: ${created.status} | officeId: ${created.officeId ?? "null (all offices)"}`);
    console.log(`    password : ${mask(password)} (bcrypt hashed, never stored in plain text)`);
  }

  const admins = await db.select({ n: users.id }).from(users).where(eq(users.role, "admin"));
  console.log(`\n  platform admins in this database: ${admins.length}`);
  console.log("\nপরবর্তী ধাপ: /login এ গিয়ে এই userId + পাসওয়ার্ড দিয়ে লগইন করুন।");
  console.log("⚠ পাসওয়ার্ডটি চ্যাট/টার্মিনাল হিস্টোরিতে থাকলে অ্যাপের ভেতর থেকে বদলে নিন।");

  await closeDb();
  process.exit(0);
}

void main();
