import { NextRequest, NextResponse } from "next/server";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { AuthError } from "@/lib/auth";
import { getMonthSummary, getOffice, listSyncLogs, officeDTO } from "@/lib/mess-data";
import { autoSyncEnabled, buildSyncPayload, pingScript, pullSheet, resolveScriptUrl, runFullSync } from "@/lib/sheets";
import { str } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { dhakaNow } from "@/lib/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** big payloads + Apps Script round trips need more than Vercel's 10s default */
export const maxDuration = 60;

/**
 * POST /api/sync
 *   body: { action: "sync" | "ping" | "payload" | "pull" | "logs", monthId?, sheetName?, scriptUrl? }
 *
 * Google Sheets is only a reporting copy — a failed sync can never lose
 * database data (spec §65).
 */
export const POST = api({ auth: true, limit: "sync", auditAction: "sheet.sync" }, async (_req: NextRequest, ctx, body) => {
  const action = str(body.action) || "sync";
  const officeId = ctx.activeOfficeId;
  if (!officeId) throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি", 400);

  const officeRow = await getOffice(officeId);
  if (!officeRow) throw new AuthError("not-found", "অফিস পাওয়া যায়নি", 404);
  const office = officeDTO(officeRow);

  if (action === "ping") {
    if (!can(ctx.user.role, "sheet.view")) throw new AuthError("forbidden", "অনুমতি নেই", 403);
    return { action, result: await pingScript(str(body.scriptUrl) || resolveScriptUrl(office)) };
  }

  if (action === "logs") {
    if (!can(ctx.user.role, "sheet.view")) throw new AuthError("forbidden", "অনুমতি নেই", 403);
    return { action, result: await listSyncLogs(office.id, 25) };
  }

  if (action === "pull") {
    if (!can(ctx.user.role, "sheet.view")) throw new AuthError("forbidden", "অনুমতি নেই", 403);
    const sheetName = str(body.sheetName) || "Meals";
    return { action, result: await pullSheet(sheetName, str(body.scriptUrl) || resolveScriptUrl(office)) };
  }

  // the remaining actions need the month payload
  if (!can(ctx.user.role, action === "sync" ? "sheet.sync" : "sheet.view")) {
    throw new AuthError("forbidden", "এই কাজটি করার অনুমতি আপনার নেই", 403);
  }

  const now = dhakaNow();
  const monthId = str(body.monthId);
  let year = Number(body.year ?? now.year);
  let month = Number(body.month ?? now.month);
  if (monthId) {
    const m = /^.+-(\d{4})-(\d{2})$/.exec(monthId);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]);
    }
  }

  const { getMonthFor, ensureMonth } = await import("@/lib/mess-data");
  const monthRow = (await getMonthFor(office.id, year, month)) ?? (await ensureMonth(office.id, year, month));
  const { data, summary } = await getMonthSummary(office.id, monthRow.id);

  if (action === "payload") {
    return { action, result: buildSyncPayload(office, data, summary) };
  }

  const result = await runFullSync({
    office,
    data,
    summary,
    trigger: "manual",
    userId: ctx.user.id,
    scriptUrl: str(body.scriptUrl) || undefined,
  });

  await audit({
    ctx: { user: ctx.user, activeOfficeId: office.id },
    action: "sheet.sync",
    entity: "sheet",
    entityId: data.id,
    monthId: data.id,
    ok: result.ok,
    message: result.message,
  });

  // spec §99 — exact response shape, returned unwrapped
  return syncJson(
    result.ok
      ? {
          ok: true,
          message: result.message || "Google Sheets full sync OK",
          sheetUrl: result.sheetUrl,
          sheetId: result.sheetId,
          syncedAt: result.syncedAt,
          configured: result.configured,
        }
      : { ok: false, message: result.message || "Sync failed", configured: result.configured },
    result.ok ? 200 : 502,
  );
});

/** GET /api/sync?action=status — quick configuration/status probe for the UI */
export const GET = api({ auth: true, limit: "sync" }, async (_req: NextRequest, ctx) => {
  if (!can(ctx.user.role, "sheet.view")) throw new AuthError("forbidden", "অনুমতি নেই", 403);
  const officeId = ctx.activeOfficeId;
  if (!officeId) throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি", 400);
  const officeRow = await getOffice(officeId);
  if (!officeRow) throw new AuthError("not-found", "অফিস পাওয়া যায়নি", 404);
  const scriptUrl = resolveScriptUrl(officeRow);
  return {
    configured: Boolean(scriptUrl),
    scriptUrl: ctx.user.role === "member" ? "" : scriptUrl,
    sheetUrl: officeRow.sheetUrl,
    sheetId: officeRow.sheetId,
    lastSyncedAt: officeRow.lastSyncedAt ? officeRow.lastSyncedAt.toISOString() : null,
    autoSync: autoSyncEnabled(),
    logs: await listSyncLogs(officeRow.id, 15),
  };
});

export function syncJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
