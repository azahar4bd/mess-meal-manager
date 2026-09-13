import { NextResponse } from "next/server";
import { setupStatus } from "@/lib/migrate";
import { resolveScriptUrl } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/setup/status — public, read-only deployment health probe.
 *
 * Answers "is this deployment ready to use?" without leaking any data:
 *   • is the schema migrated (all 13 tables present)?
 *   • is the database reachable, and through which driver?
 *   • has any office been created yet?
 *   • is Google Sheets sync configured?
 *
 * It returns counts only (never names or user data), and points at the exact
 * next command when something is missing.
 */
export async function GET() {
  const started = Date.now();
  const status = await setupStatus();

  const nextSteps: string[] = [];
  if (!status.databaseOk) {
    nextSteps.push(
      "ডেটাবেসে সংযোগ হচ্ছে না — Vercel-এ DATABASE_URL ঠিক আছে কিনা দেখুন (Neon-এর pooler URL, শেষে ?sslmode=require)।",
    );
  } else if (!status.migrated) {
    nextSteps.push(
      `স্কিমা তৈরি হয়নি (missing: ${status.missing.slice(0, 5).join(", ")}${status.missing.length > 5 ? " …" : ""})।`,
      "লোকাল থেকে: DATABASE_URL=\"<neon-url>\" npm run db:migrate:sql",
      "অথবা ব্রাউজার থেকে একবার: POST /api/migrations {\"secret\":\"<MIGRATION_SECRET>\"}",
    );
  } else if (status.counts.offices === 0) {
    nextSteps.push(
      "স্কিমা প্রস্তুত কিন্তু কোনো অফিস নেই। /signup পেজে গিয়ে প্রথম অফিস (মেস) খুলুন — অথবা ডেমো ডেটা চাইলে লোকাল থেকে: DATABASE_URL=\"<neon-url>\" npm run db:seed",
    );
  } else {
    nextSteps.push("সব প্রস্তুত — /login থেকে লগইন করুন।");
  }
  if (!resolveScriptUrl()) {
    nextSteps.push(
      "Google Sheets সিঙ্ক কনফিগার করা নেই (ঐচ্ছিক): অফিস → গুগল শিট ট্যাবে Apps Script /exec URL দিন, অথবা GOOGLE_SCRIPT_WEB_APP_URL সেট করুন।",
    );
  }

  return NextResponse.json({
    ok: status.databaseOk && status.migrated,
    ready: status.databaseOk && status.migrated && status.counts.offices > 0,
    app: "Mess Meal Manager",
    version: "1.0.0",
    database: {
      ok: status.databaseOk,
      driver: status.driver,
      migrated: status.migrated,
      tables: status.tables.length,
      missingTables: status.missing,
      error: status.error ?? null,
    },
    counts: status.counts,
    googleSheets: { configured: Boolean(resolveScriptUrl()) },
    nextSteps,
    latencyMs: Date.now() - started,
    time: new Date().toISOString(),
  });
}
