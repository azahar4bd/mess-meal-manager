import { NextRequest, NextResponse } from "next/server";
import { api } from "@/lib/api";
import { AuthError } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getMonthFor, getMonthSummary, getOffice, officeDTO, ensureMonth, listMembers, memberDTO } from "@/lib/mess-data";
import { buildCsv, csvBlobParts, csvFilename } from "@/lib/report-csv";
import { buildPrintHtml, printFilename } from "@/lib/report-pdf";
import { dhakaNow, toIsoDate } from "@/lib/date";
import { str } from "@/lib/validate";
import { audit } from "@/lib/audit";
import type { MemberCalculation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** big payloads + Apps Script round trips need more than Vercel's 10s default */
export const maxDuration = 60;

/**
 * GET /api/report/export?format=csv|html&variant=full|members|meals|bazar|deposits|incomes|extras
 *                      &monthId=&year=&month=&fromDate=&toDate=
 *
 * format=csv  → .csv download (UTF-8 BOM, Excel friendly)     — spec §43
 * format=html → print-ready A4 report; "Save as PDF" in browser — spec §42
 */
export const GET = api({ auth: true, limit: "export", auditAction: "report.export" }, async (req: NextRequest, ctx) => {
  if (!can(ctx.user.role, "report.export")) throw new AuthError("forbidden", "রিপোর্ট এক্সপোর্ট করার অনুমতি নেই", 403);

  const officeId = ctx.activeOfficeId;
  if (!officeId) throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি", 400);
  const officeRow = await getOffice(officeId);
  if (!officeRow) throw new AuthError("not-found", "অফিস পাওয়া যায়নি", 404);
  const office = officeDTO(officeRow);

  const p = req.nextUrl.searchParams;
  const now = dhakaNow();
  const monthId = str(p.get("monthId"));
  let year = Number(p.get("year") ?? now.year);
  let month = Number(p.get("month") ?? now.month);
  if (monthId) {
    const m = /^.+-(\d{4})-(\d{2})$/.exec(monthId);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]);
    }
  }
  const monthRow = (await getMonthFor(officeId, year, month)) ?? (await ensureMonth(officeId, year, month));

  const fromDate = p.get("fromDate") ? toIsoDate(str(p.get("fromDate"))) : null;
  const toDate = p.get("toDate") ? toIsoDate(str(p.get("toDate"))) : null;
  const { data, summary } = await getMonthSummary(
    officeId,
    monthRow.id,
    fromDate && toDate ? { fromDate, toDate } : undefined,
  );

  // members may only export their own numbers
  if (ctx.user.role === "member") {
    const roster = (await listMembers(officeId, monthRow.id)).map(memberDTO);
    const phone = (ctx.user.phone ?? "").trim();
    const selfId = roster.find((m) => (phone && m.phone === phone) || m.name.toLowerCase() === ctx.user.name.toLowerCase())?.id;
    const own = summary.memberCalculations.filter((c: MemberCalculation) => c.memberId === selfId);
    summary.memberCalculations = own;
  }

  const format = (str(p.get("format")) || "csv").toLowerCase();

  await audit({
    ctx: { user: ctx.user, activeOfficeId: officeId },
    action: `report.export.${format}`,
    entity: "report",
    entityId: data.id,
    monthId: data.id,
    message: `${format.toUpperCase()} এক্সপোর্ট — ${data.monthName}`,
  });

  if (format === "html" || format === "pdf" || format === "print") {
    const html = buildPrintHtml({ office, data, summary, fromDate, toDate, preparedBy: ctx.user.name });
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `inline; filename="${printFilename(office, data)}.html"`,
      },
    });
  }

  const variant = str(p.get("variant")) || "full";
  const csv = csvBlobParts(buildCsv(variant, { office, data, summary, fromDate, toDate }));
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${csvFilename(office, data, variant)}"`,
    },
  });
});
