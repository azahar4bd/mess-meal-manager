import { NextRequest, NextResponse } from "next/server";
import { AuthError, type SessionContext } from "@/lib/auth";
import { ValidationError } from "@/lib/validate";
import { can, type Capability } from "@/lib/permissions";
import { rateLimit, LIMITS, type RateLimitResult } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export type Handler<Ctx = Record<string, unknown>> = (
  req: NextRequest,
  ctx: SessionContext,
  body: Record<string, unknown>,
  extra: Ctx,
) => Promise<unknown> | unknown;

export interface RouteOptions {
  /** require an authenticated session (default true) */
  auth?: boolean;
  /** capability the caller must hold */
  capability?: Capability;
  /** require an active office in context */
  office?: boolean;
  /** rate limit preset — "none" disables the generic limiter (route has its own) */
  limit?: keyof typeof LIMITS | "none";
  /** audit action name (writes should always set this) */
  auditAction?: string;
}

/**
 * Uniform, hardened API wrapper:
 *   body parse → rate limit → session → user → role → office → permission → handler
 * Errors never leak stack traces in production and never render a blank screen.
 */
export function api(options: RouteOptions, handler: Handler): (req: NextRequest) => Promise<NextResponse> {
  const { auth = true, capability, office = false, limit = "write", auditAction } = options;

  return async (req: NextRequest) => {
    let body: Record<string, unknown> = {};
    let ctx: SessionContext | null = null;

    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const text = await req.text();
        if (text) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            return json(
              { ok: false, error: "রিকোয়েস্ট বডি সঠিক JSON নয়", code: "invalid-json" },
              400,
            );
          }
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            body = parsed as Record<string, unknown>;
          } else if (Array.isArray(parsed)) {
            body = { items: parsed };
          }
        }
      } else {
        // allow GET query params to act as the body
        body = Object.fromEntries(req.nextUrl.searchParams.entries());
      }

      // ── rate limit ────────────────────────────────────────
      if (limit !== "none") {
        const preset = LIMITS[limit];
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
        // authenticated callers are limited per session token, anonymous ones per IP
        const sessionCookie = req.cookies.get("mmm_session")?.value ?? "";
        const identity = sessionCookie ? `s:${sessionCookie.slice(0, 24)}` : `ip:${ip}`;
        const key = `${limit}:${identity}:${req.nextUrl.pathname}:${String(body.action ?? "")}`;
        const rl: RateLimitResult = rateLimit(key, preset.limit, preset.windowMs);
        if (!rl.ok) {
          return json(
            { ok: false, error: "অনেক বেশি অনুরোধ। কিছুক্ষণ পরে আবার চেষ্টা করুন।", code: "rate-limited" },
            429,
            { "Retry-After": String(rl.retryAfterSeconds) },
          );
        }
      }

      // ── session / user / role / office ────────────────────
      if (auth) {
        const { requireSession, requireOffice } = await import("@/lib/auth");
        ctx = office ? await requireOffice() : await requireSession();

        // members awaiting approval get read-only access (spec §15)
        if (ctx.user.status === "pending" && capability && capability.endsWith(".write")) {
          return json(
            {
              ok: false,
              error: "আপনার অনুমোদন বাকি আছে — ম্যানেজার অনুমোদন করলে আপনি তথ্য যোগ/পরিবর্তন করতে পারবেন",
              code: "pending-approval",
            },
            403,
          );
        }
        if (ctx.user.role === "member" && capability === "user.manage") {
          return json({ ok: false, error: "এই কাজটি করার অনুমতি আপনার নেই", code: "forbidden" }, 403);
        }

        if (capability && !can(ctx.user.role, capability)) {
          await audit({
            ctx,
            action: auditAction ?? "access.denied",
            ok: false,
            message: `denied capability ${capability}`,
          }).catch(() => undefined);
          return json(
            { ok: false, error: "এই কাজটি করার অনুমতি আপনার নেই", code: "forbidden" },
            403,
          );
        }
      }

      const result = await handler(req, ctx as unknown as SessionContext, body, {});
      if (result instanceof NextResponse) return result;
      return json({ ok: true, data: result ?? null });
    } catch (err) {
      return handleError(err, ctx, auditAction);
    }
  };
}

export function handleError(err: unknown, ctx?: SessionContext | null, action?: string): NextResponse {
  if (err instanceof AuthError) {
    return json({ ok: false, error: err.message, code: err.code }, err.status);
  }
  if (err instanceof ValidationError) {
    return json({ ok: false, error: err.message, code: "validation", fields: err.fields }, err.status || 400);
  }

  const e = err as { message?: string; code?: string; detail?: string };
  const message = e?.message ?? "অজানা ত্রুটি";

  // friendly message for unique-constraint violations
  if (e?.code === "23505") {
    return json({ ok: false, error: "এই তথ্যটি আগেই সংরক্ষিত আছে (duplicate entry)", code: "duplicate" }, 409);
  }
  if (e?.code === "23503") {
    return json({ ok: false, error: "সম্পর্কিত তথ্য পাওয়া যায়নি — পেজটি রিফ্রেশ করুন", code: "foreign-key" }, 400);
  }
  if (e?.code === "23502") {
    return json({ ok: false, error: "আবশ্যকীয় তথ্য পূরণ করা হয়নি", code: "not-null" }, 400);
  }
  if (e?.code === "ECONNREFUSED" || /database|connection|ECONNREFUSED/i.test(message)) {
    return json(
      {
        ok: false,
        error: "ডেটাবেস সংযোগ পাওয়া যায়নি। PostgreSQL চালু আছে কিনা দেখুন।",
        code: "db-unavailable",
      },
      503,
    );
  }

  if (ctx && action) {
    audit({ ctx, action: `${action}.error`, ok: false, message }).catch(() => undefined);
  }

  console.error(`[api] ${action ?? "handler"} failed:`, err);
  const isDev = process.env.NODE_ENV !== "production";
  return json(
    {
      ok: false,
      error: isDev ? message : "সার্ভারে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
      code: "server-error",
      ...(isDev ? { detail: String(e?.detail ?? "") } : {}),
    },
    500,
  );
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", ...headers },
  });
}

export function ok<T>(data: T, extra: Record<string, unknown> = {}): NextResponse {
  return json({ ok: true, data, ...extra });
}

export function fail(error: string, status = 400, code = "bad-request", fields?: Record<string, string>): NextResponse {
  return json({ ok: false, error, code, ...(fields ? { fields } : {}) }, status);
}
