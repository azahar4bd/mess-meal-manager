/**
 * Google Sheets synchronization layer (spec §44, §55–§65, §98–§99).
 *
 * Priority:  PostgreSQL = primary database.  Google Sheets = reporting copy.
 * A failed sync must NEVER lose or block database data — every failure is
 * caught, logged to `sync_logs` and surfaced to the UI as a message.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { offices, syncLogs, cryptoId } from "@/db/schema";
import { round2, toNumber } from "@/lib/format";
import { toDisplayDate, toDisplayDateTime } from "@/lib/date";
import {
  COLUMNS,
  OFFICE_INFO_KEYS,
  SHEET_TABS,
  SYNC_PAYLOAD_VERSION,
  type SheetBlock,
  type SyncPayload,
} from "@/lib/sheet-structure";
import type { MessData, MonthSummary, OfficeDTO } from "@/lib/types";

/* ────────────────────────────────────────────────────────────
 *  payload builder — DB rows → sheet rows
 * ──────────────────────────────────────────────────────────── */

export function buildSyncPayload(
  office: OfficeDTO,
  data: MessData,
  summary: MonthSummary,
  syncedAt: Date = new Date(),
): SyncPayload {
  const at = syncedAt.toISOString();
  const memberName = new Map(data.members.map((m) => [m.id, m.name]));

  const officeInfo: SheetBlock = {
    name: SHEET_TABS.OFFICE_INFO,
    headers: COLUMNS.officeInfo,
    rows: OFFICE_INFO_KEYS.map((key) => {
      const value = (() => {
        switch (key) {
          case "OfficeID":
            return office.id;
          case "OfficeName":
            return office.name;
          case "Branch":
            return office.branch;
          case "OfficeCode":
            return office.code;
          case "ManagerName":
            return office.managerName;
          case "ManagerPhone":
            return office.managerPhone;
          case "ManagerEmail":
            return office.managerEmail;
          case "SheetURL":
            return office.sheetUrl;
          case "MonthID":
            return data.id;
          case "MonthName":
            return data.monthName;
          case "Year":
            return data.year;
          case "Month":
            return data.month;
          case "TotalDays":
            return data.totalDays;
          case "SyncedAt":
            return toDisplayDateTime(at);
          default:
            return "";
        }
      })();
      return [key, value as string | number];
    }),
  };

  const membersSheet: SheetBlock = {
    name: SHEET_TABS.MEMBERS,
    headers: COLUMNS.members,
    rows: data.members.map((m) => [
      m.id,
      m.name,
      m.role,
      m.phone,
      m.isActive ? "TRUE" : "FALSE",
      office.id,
      data.id,
    ]),
  };

  const mealsSheet: SheetBlock = {
    name: SHEET_TABS.MEALS,
    headers: COLUMNS.meals,
    rows: [...data.dailyMeals]
      .sort((a, b) => a.day - b.day || a.memberName.localeCompare(b.memberName))
      .map((r) => [
        data.id,
        data.year,
        data.month,
        r.day,
        toDisplayDate(r.date),
        r.memberId,
        r.memberName || memberName.get(r.memberId) || "",
        round2(toNumber(r.meals)),
      ]),
  };

  const bazarSheet: SheetBlock = {
    name: SHEET_TABS.BAZAR,
    headers: COLUMNS.bazar,
    rows: [...data.bazarExpenses]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => [
        r.id,
        data.id,
        toDisplayDate(r.date),
        r.day,
        r.memberId ?? "",
        r.buyerName,
        r.category,
        r.items,
        round2(r.amount),
        r.note,
      ]),
  };

  const depositsSheet: SheetBlock = {
    name: SHEET_TABS.DEPOSITS,
    headers: COLUMNS.deposits,
    rows: [...data.deposits]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => [
        r.id,
        data.id,
        toDisplayDate(r.date),
        r.day,
        r.memberId ?? "",
        r.memberName,
        round2(r.amount),
        r.note,
        r.type || "permanent_fund",
      ]),
  };

  const incomeSheet: SheetBlock = {
    name: SHEET_TABS.INCOME,
    headers: COLUMNS.income,
    rows: [...data.otherIncomes]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => [r.id, data.id, toDisplayDate(r.date), r.day, r.title, round2(r.amount), r.note]),
  };

  const summarySheet: SheetBlock = {
    name: SHEET_TABS.SUMMARY,
    headers: COLUMNS.summary,
    rows: [
      [
        data.id,
        data.monthName,
        summary.activeMembers,
        round2(summary.totalMill),
        round2(summary.perMillRate),
        round2(summary.totalBazarCost),
        round2(summary.totalOthersIncome),
        round2(summary.netCost),
        round2(summary.totalFund),
        round2(summary.totalSharedExtra),
        round2(summary.lastBalance),
        toDisplayDateTime(at),
      ],
    ],
  };

  const denaPoanaSheet: SheetBlock = {
    name: SHEET_TABS.DENA_PAONA,
    headers: COLUMNS.denaPoana,
    rows: summary.memberCalculations.map((m) => [
      data.id,
      m.memberId,
      m.name,
      m.role,
      round2(m.totalMill),
      round2(m.perMillRate),
      round2(m.mealCost),
      round2(m.individualExtra),
      round2(m.sharedExtra),
      round2(m.totalCost),
      round2(m.totalDeposit),
      round2(m.selfPaidBazar),
      round2(m.denaPoana),
      round2(m.permanentFund),
      `${m.status} / ${m.statusEn}`,
    ]),
  };

  return {
    ok: true,
    action: "sync",
    version: SYNC_PAYLOAD_VERSION,
    syncedAt: at,
    office: {
      id: office.id,
      name: office.name,
      branch: office.branch,
      code: office.code,
      managerName: office.managerName,
      managerPhone: office.managerPhone,
      managerEmail: office.managerEmail,
      sheetUrl: office.sheetUrl,
      sheetId: office.sheetId,
    },
    month: {
      id: data.id,
      name: data.monthName,
      year: data.year,
      month: data.month,
      totalDays: data.totalDays,
    },
    sheets: [
      officeInfo,
      membersSheet,
      mealsSheet,
      bazarSheet,
      depositsSheet,
      incomeSheet,
      summarySheet,
      denaPoanaSheet,
    ],
  };
}

/* ────────────────────────────────────────────────────────────
 *  Apps Script transport
 * ──────────────────────────────────────────────────────────── */

export function resolveScriptUrl(office?: { scriptUrl?: string | null } | null): string {
  return (
    (office?.scriptUrl ?? "").trim() ||
    (process.env.GOOGLE_SCRIPT_WEB_APP_URL ?? "").trim() ||
    (process.env.GOOGLE_SHEETS_WEBHOOK ?? "").trim()
  );
}

export interface ScriptResponse {
  ok: boolean;
  message?: string;
  sheetUrl?: string;
  sheetId?: string;
  syncedAt?: string;
  [k: string]: unknown;
}

async function callScript(
  url: string,
  body: unknown,
  timeoutMs = Number(process.env.SYNC_TIMEOUT_MS ?? 45_000),
): Promise<ScriptResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      // text/plain avoids a CORS preflight against Apps Script
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `Apps Script HTTP ${res.status}: ${text.slice(0, 300) || res.statusText}`,
      };
    }
    if (parsed && typeof parsed === "object") return parsed as ScriptResponse;
    return { ok: false, message: `Apps Script returned non-JSON response: ${text.slice(0, 200)}` };
  } catch (err) {
    const e = err as Error;
    return {
      ok: false,
      message: e.name === "AbortError" ? "Sync timeout" : `Sync request failed: ${e.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function pingScript(url?: string): Promise<ScriptResponse> {
  const target = (url ?? "").trim() || resolveScriptUrl();
  if (!target) return { ok: false, message: "GOOGLE_SCRIPT_WEB_APP_URL সেট করা নেই" };
  const sep = target.includes("?") ? "&" : "?";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${target}${sep}action=ping`, { signal: controller.signal, cache: "no-store" });
    const text = await res.text();
    try {
      return JSON.parse(text) as ScriptResponse;
    } catch {
      return { ok: res.ok, message: text.slice(0, 200) };
    }
  } catch (err) {
    return { ok: false, message: `Ping failed: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function pullSheet(
  sheetName: string,
  url?: string,
): Promise<{ ok: boolean; message?: string; rows?: unknown[][] }> {
  const target = (url ?? "").trim() || resolveScriptUrl();
  if (!target) return { ok: false, message: "GOOGLE_SCRIPT_WEB_APP_URL সেট করা নেই" };
  const sep = target.includes("?") ? "&" : "?";
  try {
    const res = await fetch(`${target}${sep}action=pull&sheetName=${encodeURIComponent(sheetName)}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; message?: string; rows?: unknown[][] };
    return { ok: Boolean(json.ok), message: json.message, rows: json.rows };
  } catch (err) {
    return { ok: false, message: `Pull failed: ${(err as Error).message}` };
  }
}

/* ────────────────────────────────────────────────────────────
 *  full sync + logging
 * ──────────────────────────────────────────────────────────── */

export interface FullSyncOptions {
  office: OfficeDTO;
  data: MessData;
  summary: MonthSummary;
  trigger?: "manual" | "auto";
  userId?: string;
  scriptUrl?: string;
}

export interface FullSyncResult {
  ok: boolean;
  message: string;
  sheetUrl: string;
  sheetId: string;
  syncedAt: string | null;
  logId: string;
  configured: boolean;
}

export async function runFullSync(opts: FullSyncOptions): Promise<FullSyncResult> {
  const started = Date.now();
  const url = (opts.scriptUrl ?? "").trim() || resolveScriptUrl(opts.office);
  const payload = buildSyncPayload(opts.office, opts.data, opts.summary);
  const size = JSON.stringify(payload).length;

  let result: ScriptResponse;
  if (!url) {
    result = {
      ok: false,
      message:
        "Google Apps Script URL কনফিগার করা নেই। অফিস সেটিংস বা GOOGLE_SCRIPT_WEB_APP_URL এ /exec URL দিন।",
    };
  } else {
    result = await callScript(url, payload);
  }

  const ok = result.ok === true;
  const sheetUrl = String(result.sheetUrl ?? opts.office.sheetUrl ?? "");
  const sheetId = String(result.sheetId ?? opts.office.sheetId ?? "");
  const syncedAt = ok ? new Date() : null;

  // persist sheet pointers returned by Apps Script
  if (ok && (sheetUrl || sheetId)) {
    await db
      .update(offices)
      .set({
        sheetUrl: sheetUrl || undefined,
        sheetId: sheetId || undefined,
        lastSyncedAt: syncedAt ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(offices.id, opts.office.id));
  }

  const logRows = await db
    .insert(syncLogs)
    .values({
      id: cryptoId("sync"),
      officeId: opts.office.id,
      monthId: opts.data.id,
      action: "sync",
      trigger: opts.trigger ?? "manual",
      ok,
      message: String(result.message ?? (ok ? "Google Sheets full sync OK" : "Sync failed")).slice(0, 500),
      sheetUrl,
      sheetId,
      durationMs: Date.now() - started,
      payloadSize: size,
      userId: opts.userId ?? "",
    })
    .returning({ id: syncLogs.id });

  return {
    ok,
    message: String(result.message ?? (ok ? "Google Sheets full sync OK" : "Sync failed")),
    sheetUrl,
    sheetId,
    syncedAt: syncedAt ? syncedAt.toISOString() : null,
    logId: logRows[0]?.id ?? "",
    configured: Boolean(url),
  };
}

/**
 * Auto sync (spec §64) — fire-and-forget, never throws, never blocks the
 * database write that triggered it.
 */
export async function maybeAutoSync(opts: FullSyncOptions): Promise<void> {
  if (String(process.env.AUTO_SYNC ?? "0") !== "1") return;
  try {
    await runFullSync({ ...opts, trigger: "auto" });
  } catch (err) {
    console.error("[auto-sync] failed (ignored):", (err as Error).message);
  }
}

export function extractSheetId(url: string): string {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url ?? "");
  return m?.[1] ?? "";
}

