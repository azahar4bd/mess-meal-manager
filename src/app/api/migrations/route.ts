import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqualStr } from "@/lib/password";
import { runMigrations } from "@/lib/migrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  POST /api/migrations  { "secret": "…" }
 *  GET  /api/migrations?secret=…          (browser convenience — same result)
 *
 *  One-shot schema setup for platforms where you cannot open a shell
 *  (Vercel + Neon). It applies every pending `drizzle/*.sql` migration and is
 *  idempotent, so calling it twice is harmless.
 *
 *  Guarded by MIGRATION_SECRET:
 *    • if MIGRATION_SECRET is NOT set on the server → the endpoint is disabled
 *      and answers 404 (it cannot be brute-forced into running)
 *    • if it IS set → the request must present the exact same value
 *
 *  Recommended flow: set MIGRATION_SECRET → deploy → call this once → verify
 *  with GET /api/setup/status → REMOVE MIGRATION_SECRET and redeploy.
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function handle(req: NextRequest): Promise<NextResponse> {
  const expected = (process.env.MIGRATION_SECRET ?? "").trim();
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "মাইগ্রেশন এন্ডপয়েন্ট বন্ধ আছে। Vercel-এ MIGRATION_SECRET এনভি ভেরিয়েবল সেট করে আবার ডিপ্লয় দিন (অথবা লোকাল থেকে npm run db:migrate:sql চালান)।",
        code: "migrations-disabled",
      },
      { status: 404 },
    );
  }

  let provided = req.nextUrl.searchParams.get("secret") ?? "";
  if (!provided && req.method !== "GET") {
    try {
      const text = await req.text();
      if (text) {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          provided = String((parsed as Record<string, unknown>).secret ?? "");
        }
      }
    } catch {
      provided = "";
    }
  }
  if (!provided) provided = req.headers.get("x-migration-secret") ?? "";

  if (!timingSafeEqualStr(provided, expected)) {
    return NextResponse.json(
      { ok: false, error: "সিক্রেট সঠিক নয়", code: "forbidden" },
      { status: 403 },
    );
  }

  const result = await runMigrations();
  return NextResponse.json(
    {
      ...result,
      ok: result.ok,
      hint: result.ok
        ? "স্কিমা প্রস্তুত। এখন GET /api/setup/status দেখুন, তারপর MIGRATION_SECRET মুছে ফেলে আবার ডিপ্লয় দিন।"
        : "এরর মেসেজটি দেখে ঠিক করে আবার এই এন্ডপয়েন্ট কল করুন।",
      time: new Date().toISOString(),
    },
    { status: result.ok ? 200 : 500 },
  );
}

export const POST = handle;
export const GET = handle;
