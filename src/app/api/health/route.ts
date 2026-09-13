import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, poolStats, IS_NEON } from "@/db";
import { offices, users } from "@/db/schema";
import { resolveScriptUrl } from "@/lib/sheets";
import { dhakaNow, todayIso } from "@/lib/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health — database / configuration liveness probe.
 * Never throws: reports `ok:false` with a diagnostic instead.
 */
export async function GET() {
  const started = Date.now();
  const now = dhakaNow();
  const result: Record<string, unknown> = {
    app: "Mess Meal Manager",
    version: "1.0.0",
    time: {
      iso: new Date().toISOString(),
      dhaka: now.iso,
      timezone: "Asia/Dhaka",
      today: todayIso(),
    },
    env: process.env.NODE_ENV,
  };

  try {
    const counts = await db
      .select({ offices: sql<number>`(select count(*)::int from offices)`, users: sql<number>`(select count(*)::int from users)` })
      .from(offices)
      .limit(1);
    const stats = poolStats();
    result.database = {
      ok: true,
      driver: stats.driver,
      serverless: IS_NEON,
      latencyMs: Date.now() - started,
      offices: counts[0]?.offices ?? 0,
      users: counts[0]?.users ?? 0,
      poolTotal: stats.total,
      poolIdle: stats.idle,
      poolWaiting: stats.waiting,
    };
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    const stats = poolStats();
    result.database = {
      ok: false,
      driver: stats.driver,
      serverless: IS_NEON,
      latencyMs: Date.now() - started,
      error: (err as Error).message,
      hint: IS_NEON
        ? "Neon-এ সংযোগ হচ্ছে না — DATABASE_URL-এ -pooler হোস্ট ও ?sslmode=require আছে কিনা দেখুন"
        : "PostgreSQL চালু করুন এবং DATABASE_URL ঠিক আছে কিনা দেখুন",
    };
    result.googleSheets = { configured: Boolean(resolveScriptUrl()) };
    void users;
    return NextResponse.json({ ok: false, ...result }, { status: 503 });
  }
}
