import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { timingSafeEqualStr } from "@/lib/password";
import { resetRateLimits, rateLimitSize, LIMITS } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/dev/reset-rate-limits   { "secret": "…" }   (or ?secret=… / x-reset-secret)
 *
 * Clears the in-memory rate-limit buckets. Handy after running the E2E suite or
 * when a legitimate user got locked out by the signup/login limiter.
 *
 * Disabled unless EITHER
 *   • the caller is an authenticated platform admin (role === "admin"), OR
 *   • RATE_LIMIT_RESET_SECRET is set and the request presents that exact value.
 * Otherwise it answers 404 so the endpoint cannot be probed in production.
 *
 * Note: the store is per-process, so on a multi-instance deployment this clears
 * only the instance that served the request.
 */
async function authorized(req: NextRequest, body: Record<string, unknown>): Promise<boolean> {
  const expected = (process.env.RATE_LIMIT_RESET_SECRET ?? "").trim();
  if (expected) {
    const provided =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-reset-secret") ??
      String(body.secret ?? "");
    if (timingSafeEqualStr(provided, expected)) return true;
  }

  try {
    const session = await getSession();
    return session?.user?.role === "admin";
  } catch {
    return false;
  }
}

export const POST = api(
  { auth: false, limit: "none", auditAction: "dev.resetRateLimits" },
  async (req: NextRequest, _ctx, body) => {
    if (!(await authorized(req, body))) {
      // 404 (not 403) so the endpoint cannot be discovered by probing
      return NextResponse.json(
        { ok: false, error: "এই এন্ডপয়েন্ট বন্ধ আছে", code: "not-found" },
        { status: 404 },
      );
    }

    const cleared = resetRateLimits();
    return NextResponse.json({
      ok: true,
      clearedBuckets: cleared,
      remainingBuckets: rateLimitSize(),
      limits: LIMITS,
      note: "ইন-মেমরি স্টোর — মাল্টি-ইনস্ট্যান্স ডিপ্লয়মেন্টে শুধু এই ইনস্ট্যান্সের বাকেট ক্লিয়ার হয়েছে।",
      time: new Date().toISOString(),
    });
  },
);
