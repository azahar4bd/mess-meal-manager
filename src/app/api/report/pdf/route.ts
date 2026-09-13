import { NextResponse } from "next/server";
import { api } from "@/lib/api";
import { AuthError } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ensureMonth, getMonthFor, getMonthSummary, getOffice, officeDTO } from "@/lib/mess-data";
import { buildPrintHtml } from "@/lib/report-pdf";
import { dhakaNow, toIsoDate } from "@/lib/date";
import { str } from "@/lib/validate";
import type { MemberCalculation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** big payloads + Apps Script round trips need more than Vercel's 10s default */
export const maxDuration = 60;

/**
 * GET /api/report/pdf — standalone print-ready report document.
 * (Same document as /api/report/export?format=html, kept for a clean URL.)
 */
export const GET = api({ auth: true, limit: "export", auditAction: "report.pdf" }, async (req, ctx) => {
  if (!can(ctx.user.role, "report.view")) throw new AuthError("forbidden", "রিপোর্ট দেখার অনুমতি নেই", 403);
  const officeId = ctx.activeOfficeId;
  if (!officeId) throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি", 400);
  const officeRow = await getOffice(officeId);
  if (!officeRow) throw new AuthError("not-found", "অফিস পাওয়া যায়নি", 404);

  const p = req.nextUrl.searchParams;
  const now = dhakaNow();
  const year = Number(p.get("year") ?? now.year);
  const month = Number(p.get("month") ?? now.month);
  const monthRow = (await getMonthFor(officeId, year, month)) ?? (await ensureMonth(officeId, year, month));
  const fromDate = p.get("fromDate") ? toIsoDate(str(p.get("fromDate"))) : null;
  const toDate = p.get("toDate") ? toIsoDate(str(p.get("toDate"))) : null;

  const { data, summary } = await getMonthSummary(officeId, monthRow.id, fromDate && toDate ? { fromDate, toDate } : undefined);

  if (ctx.user.role === "member") {
    const phone = (ctx.user.phone ?? "").trim();
    summary.memberCalculations = summary.memberCalculations.filter(
      (c: MemberCalculation) => (phone && c.phone === phone) || c.name.toLowerCase() === ctx.user.name.toLowerCase(),
    );
  }

  return new NextResponse(buildPrintHtml({ office: officeDTO(officeRow), data, summary, fromDate, toDate, preparedBy: ctx.user.name }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0" },
  });
});
