import { after, NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cryptoId, messMonths, offices, sessions, syncLogs, users, type User } from "@/db/schema";
import {
  getNotices,
  getNoticesForEdit,
  getTexts,
  setNotices,
  setTexts,
  type Notice,
  type UiTexts,
} from "@/lib/ui-content";
import { api, fail } from "@/lib/api";
import { AuthError, setActiveOffice, type SessionContext } from "@/lib/auth";
import { audit, listAllAuditLogs, listAuditLogs } from "@/lib/audit";
import { can, ROLE_HOME, type Capability } from "@/lib/permissions";
import { calculateMonth } from "@/lib/calc";
import {
  addMonths,
  dhakaNow,
  isValidIso,
  monthLabel,
  monthLabelBn,
  toIsoDate,
} from "@/lib/date";
import { num, str } from "@/lib/validate";
import {
  bazarDTO,
  copyRoster,
  createBazar,
  createDeposit,
  createExtra,
  createIncome,
  createMember,
  deleteBazar,
  deleteDeposit,
  getDeposit,
  deleteExtra,
  deleteIncome,
  deleteMeal,
  deleteMember,
  depositDTO,
  extraDTO,
  findUserByLogin,
  getMember,
  getMonth,
  getMonthFor,
  getMonthSummary,
  getOffice,
  incomeDTO,
  listBazar,
  listDeposits,
  listExtras,
  listIncomes,
  backfillCarryIfMissing,
  closeMonthAndOpenNext,
  deleteMonth,
  listMembers,
  reorderMembers,
  listMeals,
  listOffices,
  listSyncLogs,
  listUsers,
  mealDTO,
  memberDTO,
  monthDTO,
  officeDTO,
  openMonth,
  reopenMonth,
  saveDayMeals,
  setMeal,
  setMonthClosed,
  updateBazar,
  updateDeposit,
  updateExtra,
  updateIncome,
  updateMember,
  updateOffice,
} from "@/lib/mess-data";
import {
  autoSyncEnabled,
  buildSyncPayload,
  extractSheetId,
  maybeAutoSync,
  pingScript,
  resolveScriptUrl,
  runFullSync,
} from "@/lib/sheets";
import {
  changeUserRole,
  createUser,
  ensureCurrentMonth,
  resetUserPassword,
  ServiceError,
  setOfficeStatus,
  setUserStatus,
} from "@/lib/service";
import {
  insertMessage as insertSupportMessage,
  listMine as listSupportMine,
  listThreads as listSupportThreads,
  markRepliesRead,
  openThread as openSupportThread,
  unreadForAdmin,
  unreadForUser,
  ensureSupportTable,
} from "@/lib/support";
import type { MemberCalculation, MessData, MonthSummary } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** big payloads + Apps Script round trips need more than Vercel's 10s default */
export const maxDuration = 60;

/* ══════════════════════════════════════════════════════════
 *  helpers
 * ══════════════════════════════════════════════════════════ */

function deny(ctx: SessionContext, capability: Capability): never {
  void ctx;
  throw new AuthError("forbidden", `এই কাজটি করার অনুমতি আপনার নেই (${capability})`, 403);
}

/** বাজারের আইটেম পপআপ থেকে আসা লাইনগুলো যাচাই করে নেওয়া */
function parseLines(value: unknown): { item: string; qty: number; price: number }[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 60).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { item: str(o.item).slice(0, 60), qty: Math.max(0, num(o.qty, 0)), price: Math.max(0, num(o.price, 0)) };
  });
}

function need<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new AuthError("not-found", message, 404);
  return value;
}

/** Resolve the month in scope — always restricted to the caller's office. */
async function resolveMonth(ctx: SessionContext, body: Record<string, unknown>) {
  const officeId = ctx.activeOfficeId;
  if (!officeId) throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি", 400);

  const now = dhakaNow();
  let year = Number(body.year ?? now.year);
  let month = Number(body.month ?? now.month);
  const explicitMonthId = str(body.monthId);

  if (explicitMonthId) {
    const m = need(await getMonth(explicitMonthId), "মাস পাওয়া যায়নি");
    if (m.officeId !== officeId) deny(ctx, "office.manage"); // cross-office access attempt
    year = m.year;
    month = m.month;
  }

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new AuthError("bad-request", "সঠিক মাস/সাল দিন", 400);
  }

  const row = need(await getMonthFor(officeId, year, month), "এই মাসের হিসাব এখনো খোলা হয়নি");
  return { officeId, month: row };
}

/** A month that is closed only accepts writes from the platform admin (spec §96). */
function assertWritable(ctx: SessionContext, month: { isClosed: boolean; monthName: string }): void {
  if (!month.isClosed) return;
  if (ctx.user.role === "admin") return;
  throw new AuthError("month-closed", `${month.monthName} মাসটি বন্ধ করা হয়েছে — শুধু অ্যাডমিন পরিবর্তন করতে পারবেন`, 403);
}

/** Members only ever see their own row in a report. */
function scopeCalcs(ctx: SessionContext, calcs: MemberCalculation[]): {
  rows: MemberCalculation[];
  self: MemberCalculation | null;
} {
  if (ctx.user.role !== "member") return { rows: calcs, self: null };
  const phone = (ctx.user.phone ?? "").trim();
  const self =
    calcs.find((c) => phone && c.phone === phone) ??
    calcs.find((c) => c.name.trim().toLowerCase() === ctx.user.name.trim().toLowerCase()) ??
    null;
  return { rows: self ? [self] : [], self };
}

async function loadOfficePayload(ctx: SessionContext) {
  const officeId = ctx.activeOfficeId;
  if (!officeId) throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি", 400);
  const office = need(await getOffice(officeId), "অফিস পাওয়া যায়নি");
  return office;
}

async function logAction(
  ctx: SessionContext,
  action: string,
  entity: string,
  entityId: string,
  message: string,
  monthId = "",
  meta?: unknown,
) {
  await audit({
    ctx: { user: ctx.user, activeOfficeId: ctx.activeOfficeId },
    action,
    entity,
    entityId,
    monthId,
    message,
    meta,
  });
}

/* ══════════════════════════════════════════════════════════
 *  ACTION HANDLERS
 * ══════════════════════════════════════════════════════════ */

type ActionHandler = (ctx: SessionContext, body: Record<string, unknown>) => Promise<unknown> | unknown;

const handlers: Record<string, ActionHandler> = {
  /* ── bootstrap / context ─────────────────────────────── */
  "bootstrap": async (ctx) => {
    const office = await loadOfficePayload(ctx);
    await ensureCurrentMonth(office.id);
    const now = dhakaNow();
    const months = await db
      .select()
      .from(messMonths)
      .where(eq(messMonths.officeId, office.id))
      .orderBy(desc(messMonths.year), desc(messMonths.month));

    // ডিফল্ট মাস: আজকের চলতি মাস (খোলা থাকলে); বন্ধ থাকলে সবচেয়ে নতুন খোলা মাস
    const current =
      months.find((m) => m.year === now.year && m.month === now.month && !m.isClosed) ??
      months.find((m) => !m.isClosed) ??
      months.find((m) => m.year === now.year && m.month === now.month) ??
      months[0];

    if (!current) {
      const created = await ensureCurrentMonth(office.id);
      return {
        office: officeDTO(office),
        months: [monthDTO(created)],
        month: monthDTO(created),
        data: await emptyMonthData(created),
        summary: emptySummary(),
        role: ctx.user.role,
        home: ROLE_HOME[ctx.user.role],
      };
    }

    const { data, summary } = await getMonthSummary(office.id, current.id);
    return {
      office: officeDTO(office),
      months: months.map(monthDTO),
      month: monthDTO(current),
      data,
      summary,
      role: ctx.user.role,
      home: ROLE_HOME[ctx.user.role],
      sync: {
        scriptConfigured: Boolean(resolveScriptUrl(office)),
        lastSyncedAt: office.lastSyncedAt ? office.lastSyncedAt.toISOString() : null,
      },
    };
  },

  "office.current": async (ctx) => officeDTO(await loadOfficePayload(ctx)),

  "office.updateSettings": async (ctx, body) => {
    if (!can(ctx.user.role, "settings.write") && ctx.user.role !== "admin") deny(ctx, "settings.write");
    const office = await loadOfficePayload(ctx);
    const sheetUrl = str(body.sheetUrl, office.sheetUrl).slice(0, 500);
    const scriptUrl = str(body.scriptUrl, office.scriptUrl).slice(0, 500);
    const updated = await updateOffice(office.id, {
      sheetUrl,
      scriptUrl,
      sheetId: sheetUrl ? extractSheetId(sheetUrl) : office.sheetId,
    });
    await logAction(ctx, "office.settings", "office", office.id, "শিট/স্ক্রিপ্ট URL হালনাগাদ");
    return officeDTO(need(updated, "অফিস হালনাগাদ করা যায়নি"));
  },

  "office.switch": async (ctx, body) => {
    const officeId = str(body.officeId) || null;
    await setActiveOffice(officeId);
    if (!officeId) return { activeOfficeId: null };
    const office = need(await getOffice(officeId), "অফিস পাওয়া যায়নি");
    await ensureCurrentMonth(office.id);
    const now = dhakaNow();
    const todays = await getMonthFor(office.id, now.year, now.month);
    // আজকের মাস বন্ধ থাকলে সবচেয়ে নতুন খোলা মাসে যাই
    const month =
      todays && !todays.isClosed
        ? todays
        : ((await db
            .select()
            .from(messMonths)
            .where(and(eq(messMonths.officeId, office.id), eq(messMonths.isClosed, false)))
            .orderBy(desc(messMonths.year), desc(messMonths.month))
            .limit(1))[0] ?? todays ?? (await ensureCurrentMonth(office.id)));
    const { data, summary } = await getMonthSummary(office.id, month.id);
    const months = await db.select().from(messMonths).where(eq(messMonths.officeId, office.id)).orderBy(desc(messMonths.year), desc(messMonths.month));
    return { activeOfficeId: office.id, office: officeDTO(office), month: monthDTO(month), months: months.map(monthDTO), data, summary };
  },

  /* ── months ──────────────────────────────────────────── */
  "month.data": async (ctx, body) => {
    if (!can(ctx.user.role, "meals.view")) deny(ctx, "meals.view");
    const { officeId, month } = await resolveMonth(ctx, body);
    // খালি ভবিষ্যৎ/পরের মাস ভুল/পুরোনো ক্যারি নিয়ে তৈরি থাকলে পূর্ব মাসের
    // সর্বশেষ হিসাব থেকে জের ও স্থায়ী ফান্ড স্বয়ংক্রিয় নতুন করে বসে
    await backfillCarryIfMissing(officeId, month.id);
    const fromDate = str(body.fromDate) || null;
    const toDate = str(body.toDate) || null;
    const { data, summary } = await getMonthSummary(
      officeId,
      month.id,
      fromDate && toDate ? { fromDate, toDate } : undefined,
    );
    const scoped = scopeCalcs(ctx, summary.memberCalculations);
    return { month: monthDTO(month), data, summary: { ...summary, memberCalculations: scoped.rows }, selfOnly: Boolean(scoped.self) };
  },

  "months.list": async (ctx) => {
    const office = await loadOfficePayload(ctx);
    const months = await db.select().from(messMonths).where(eq(messMonths.officeId, office.id)).orderBy(desc(messMonths.year), desc(messMonths.month));
    return months.map(monthDTO);
  },

  "month.open": async (ctx, body) => {
    if (!can(ctx.user.role, "month.write")) deny(ctx, "month.write");
    const office = await loadOfficePayload(ctx);
    const now = dhakaNow();
    const year = Number(body.year ?? now.year);
    const month = Number(body.month ?? now.month);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      throw new AuthError("bad-request", "সঠিক সাল ও মাস দিন", 400);
    }
    // সদস্য তালিকা ও দেনা-পাওনা সর্বদা স্বয়ংক্রিয়ভাবে আগের মাস থেকে চলে আসে
    const result = await openMonth(office.id, year, month, {
      copyMembers: true,
      carryForwardBalance: num(body.carryForwardBalance, 0),
      note: str(body.note).slice(0, 200),
      carryMemberBalances: false,
      carryDues: true,
    });
    await logAction(
      ctx,
      "month.open",
      "month",
      result.month.id,
      `নতুন মাস খোলা হয়েছে: ${monthLabel(year, month)}${result.carriedDues ? ` (${result.carriedDues} জনের জের ক্যারি)` : ""}${result.carriedBalances ? ` (${result.carriedBalances} জনের বাকি ক্যারি)` : ""}`,
    );
    return {
      month: monthDTO(result.month),
      copiedMembers: result.copiedMembers,
      carriedBalances: result.carriedBalances,
      carriedDues: result.carriedDues,
    };
  },

  "month.close": async (ctx, body) => {
    if (!can(ctx.user.role, "month.write")) deny(ctx, "month.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    const closed = body.closed === undefined ? true : Boolean(body.closed);
    // বন্ধ মাস পুনরায় খোলা (reopen) শুধুই প্ল্যাটফর্ম অ্যাডমিন — UI-এর মতো সার্ভারেও একই নিয়ম
    if (!closed && !can(ctx.user.role, "office.manage")) deny(ctx, "office.manage");
    const updated = need(await setMonthClosed(month.id, officeId, closed), "মাস হালনাগাদ করা যায়নি");
    await logAction(ctx, closed ? "month.close" : "month.reopen", "month", month.id, closed ? "মাস বন্ধ করা হয়েছে" : "মাস পুনরায় খোলা হয়েছে");
    return monthDTO(updated);
  },

  /**
   * চালু মাস ক্লোজ → পরের মাস স্বয়ংক্রিয় খোলা (রোস্টার + নগদ ক্যারি + জের)।
   * কোনো আলাদা "নতুন মাস" অপশন নেই — ক্লোজই নতুন মাস শুরু করে।
   */
  "month.closeAndOpen": async (ctx, body) => {
    if (!can(ctx.user.role, "month.write")) deny(ctx, "month.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    if (month.isClosed) throw new AuthError("month-closed", `${month.monthName} মাসটি আগেই বন্ধ`, 409);
    const result = await closeMonthAndOpenNext(officeId, month.id);
    await logAction(
      ctx,
      "month.close",
      "month",
      month.id,
      `${month.monthName} মাস বন্ধ ও ${result.nextMonth.monthName} স্বয়ংক্রিয় খোলা হয়েছে (নগদ ক্যারি ৳${result.lastBalance}${result.carriedDues ? `, ${result.carriedDues} জনের জের` : ""}${result.carriedBalances ? `, ${result.carriedBalances} জনের পাওনা` : ""})`,
    );
    // ডিফল্ট ফোকাস: আজকের চলতি মাস খোলা থাকলে সেটাই (পুরনো মাস বন্ধ করলেও
    // অ্যাপ চলতি মাসে ফেরত আসবে); আজকের মাসটাই এইমাত্র বন্ধ হলে নতুন খোলা মাস।
    const now = dhakaNow();
    let focusRow = await getMonthFor(officeId, now.year, now.month);
    if (!focusRow || focusRow.isClosed) focusRow = result.nextMonth;
    return {
      closedMonth: monthDTO(result.closedMonth),
      nextMonth: monthDTO(result.nextMonth),
      focusMonth: monthDTO(focusRow),
      copiedMembers: result.copiedMembers,
      carriedBalances: result.carriedBalances,
      carriedDues: result.carriedDues,
      lastBalance: result.lastBalance,
    };
  },

  /** অ্যাডমিন-অনলি: পুরনো/বন্ধ মাস পুনরায় চালু (রিওপেন) — ম্যানেজার পারবেন না */
  "month.reopen": async (ctx, body) => {
    if (!can(ctx.user.role, "office.manage")) deny(ctx, "office.manage");
    const { officeId, month } = await resolveMonth(ctx, body);
    if (!month.isClosed) return monthDTO(month);
    const result = await reopenMonth(officeId, month.id);
    await logAction(
      ctx,
      "month.reopen",
      "month",
      month.id,
      `${month.monthName} মাস পুনরায় চালু করা হয়েছে${result.nextCleared ? " (পরের মাসের পুরোনো ক্যারি রিসেট)" : ""}`,
    );
    return monthDTO(result.month);
  },

  /** অ্যাডমিন-অনলি: যেকোনো মাস (তার সব ডেটাসহ) সম্পূর্ণ মুছে ফেলা */
  "month.delete": async (ctx, body) => {
    if (!can(ctx.user.role, "office.manage")) deny(ctx, "office.manage");
    const { officeId, month } = await resolveMonth(ctx, body);
    const monthCount = await db
      .select({ id: messMonths.id })
      .from(messMonths)
      .where(eq(messMonths.officeId, officeId))
      .limit(2);
    if (monthCount.length <= 1) {
      throw new AuthError("bad-request", "এটিই একমাত্র মাস — মুছে ফেলা যাবে না", 400);
    }
    const result = await deleteMonth(officeId, month.id);
    if (!result.deleted) throw new AuthError("not-found", "মাস পাওয়া যায়নি", 404);
    await logAction(ctx, "month.delete", "month", month.id, `${result.monthName} মাস সম্পূর্ণ মুছে ফেলা হয়েছে`);
    // মুছে ফেলার পর বেছে নেওয়ার মতো একটি মাস ফেরত দিই
    const remaining = await db
      .select()
      .from(messMonths)
      .where(eq(messMonths.officeId, officeId))
      .orderBy(desc(messMonths.year), desc(messMonths.month))
      .limit(1);
    if (remaining[0]) await ensureCurrentMonth(officeId);
    const fallback = remaining[0] ?? null;
    return { deleted: true, deletedId: month.id, fallback: fallback ? monthDTO(fallback) : null };
  },

  "month.copyRoster": async (ctx, body) => {
    if (!can(ctx.user.role, "members.write")) deny(ctx, "members.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    const fromMonthId = str(body.fromMonthId);
    if (!fromMonthId) throw new AuthError("bad-request", "উৎস মাস নির্বাচন করুন", 400);
    const from = need(await getMonth(fromMonthId), "উৎস মাস পাওয়া যায়নি");
    if (from.officeId !== officeId) deny(ctx, "office.manage");
    const copied = await copyRoster(officeId, from.id, month.id);
    await logAction(ctx, "month.copyRoster", "month", month.id, `${from.monthName} থেকে ${copied} জন সদস্য কপি`);
    return { copied };
  },

  /* ── members ─────────────────────────────────────────── */
  "members.list": async (ctx, body) => {
    if (!can(ctx.user.role, "members.view")) deny(ctx, "members.view");
    const { officeId, month } = await resolveMonth(ctx, body);
    const rows = await listMembers(officeId, month.id);
    return rows.map(memberDTO);
  },

  "member.create": async (ctx, body) => {
    if (!can(ctx.user.role, "members.write")) deny(ctx, "members.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const name = str(body.name);
    if (name.length < 2) throw new AuthError("bad-request", "সদস্যের নাম লিখুন", 400);
    const created = await createMember(officeId, month.id, {
      name,
      phone: str(body.phone).slice(0, 20),
      role: str(body.role, "member") || "member",
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      note: str(body.note).slice(0, 200),
      openingDue: Math.max(0, num(body.openingDue, 0)),
    });
    await logAction(ctx, "member.create", "member", created.id, `নতুন সদস্য: ${name}`, month.id);
    return memberDTO(created);
  },

  "member.update": async (ctx, body) => {
    if (!can(ctx.user.role, "members.write")) deny(ctx, "members.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const id = str(body.id);
    need(await getMember(officeId, id), "সদস্য পাওয়া যায়নি");
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = str(body.name).slice(0, 80);
    if (body.phone !== undefined) patch.phone = str(body.phone).slice(0, 20);
    if (body.role !== undefined) patch.role = str(body.role).slice(0, 20);
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    if (body.note !== undefined) patch.note = str(body.note).slice(0, 200);
    if (body.openingDue !== undefined) patch.openingDue = Math.max(0, num(body.openingDue, 0));
    const updated = need(await updateMember(officeId, id, patch), "সদস্য হালনাগাদ করা যায়নি");
    await logAction(ctx, "member.update", "member", id, `সদস্য হালনাগাদ: ${updated.name}`, month.id);
    return memberDTO(updated);
  },

  "member.delete": async (ctx, body) => {
    if (!can(ctx.user.role, "members.write")) deny(ctx, "members.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const id = str(body.id);
    const member = need(await getMember(officeId, id), "সদস্য পাওয়া যায়নি");
    const deleted = await deleteMember(officeId, id);
    await logAction(ctx, "member.delete", "member", id, `সদস্য মুছে ফেলা হয়েছে: ${member.name}`, month.id);
    return { deleted, id };
  },

  "members.reorder": async (ctx, body) => {
    if (!can(ctx.user.role, "members.write")) deny(ctx, "members.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const ids = Array.isArray(body.ids) ? body.ids.map((x) => str(x)).filter(Boolean).slice(0, 300) : [];
    if (!ids.length) throw new ServiceError("সাজানোর জন্য সদস্যের তালিকা পাওয়া যায়নি", 400, { ids: "খালি" });
    const saved = await reorderMembers(officeId, month.id, ids);
    await logAction(ctx, "members.reorder", "member", month.id, `সদস্যের ক্রম সাজানো হয়েছে (${saved} জন)`, month.id);
    const rows = await listMembers(officeId, month.id);
    return { saved, members: rows.map(memberDTO) };
  },

  /* ── এডিটেবল টেক্সট ও স্ক্রলিং নোটিশ বোর্ড ───────────── */
  "ui.content": async (ctx) => {
    const officeId = ctx.activeOfficeId;
    const [texts, notices] = await Promise.all([getTexts(officeId), getNotices(officeId)]);
    return { texts, notices };
  },

  "ui.editor": async (ctx, body) => {
    const global = str(body.scope) === "global";
    // হিরো/হেডার/ফুটার/নোটিশ — যেকোনো স্কোপের কন্টেন্ট এডিট শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিন
    if (ctx.user.role !== "admin") deny(ctx, "settings.write");
    const officeId = global ? null : ctx.activeOfficeId;
    if (!global && !officeId) throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি", 400);
    const [texts, notices] = await Promise.all([getTexts(officeId), getNoticesForEdit(officeId)]);
    return { scope: global ? "global" : "office", texts, notices };
  },

  "ui.updateTexts": async (ctx, body) => {
    const global = str(body.scope) === "global";
    // হিরো/হেডার/ফুটার/নোটিশ — যেকোনো স্কোপের কন্টেন্ট এডিট শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিন
    if (ctx.user.role !== "admin") deny(ctx, "settings.write");
    const officeId = global ? null : ctx.activeOfficeId;
    if (!global && !officeId) throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি", 400);
    const raw = (body.texts ?? {}) as Record<string, unknown>;
    const texts = await setTexts(officeId, raw as Partial<UiTexts>);
    await logAction(ctx, "ui.updateTexts", global ? "platform" : "office", officeId ?? "global", "ইউআই টেক্সট হালনাগাদ");
    return { texts };
  },

  "ui.updateNotices": async (ctx, body) => {
    const global = str(body.scope) === "global";
    // হিরো/হেডার/ফুটার/নোটিশ — যেকোনো স্কোপের কন্টেন্ট এডিট শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিন
    if (ctx.user.role !== "admin") deny(ctx, "settings.write");
    const officeId = global ? null : ctx.activeOfficeId;
    if (!global && !officeId) throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি", 400);
    const list: Notice[] = (Array.isArray(body.notices) ? body.notices : [])
      .slice(0, 20)
      .map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return {
          id: str(o.id) || cryptoId("ntc"),
          text: str(o.text).slice(0, 240),
          active: o.active !== false,
          createdAt: str(o.createdAt) || new Date().toISOString(),
        };
      })
      .filter((n) => n.text.trim().length > 0);
    await setNotices(officeId, list);
    await logAction(ctx, "ui.updateNotices", global ? "platform" : "office", officeId ?? "global", `নোটিশ বোর্ড হালনাগাদ (${list.length}টি)`);
    return { notices: list, active: await getNotices(officeId) };
  },

  /* ── daily meals ─────────────────────────────────────── */
  "meals.list": async (ctx, body) => {
    if (!can(ctx.user.role, "meals.view")) deny(ctx, "meals.view");
    const { officeId, month } = await resolveMonth(ctx, body);
    const [mealRows, memberRows] = await Promise.all([listMeals(officeId, month.id), listMembers(officeId, month.id)]);
    const nameById = new Map(memberRows.map((m) => [m.id, m.name]));
    return mealRows.map((r) => mealDTO(r, nameById.get(r.memberId) ?? ""));
  },

  "meals.saveDay": async (ctx, body) => {
    if (!can(ctx.user.role, "meals.write")) deny(ctx, "meals.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);

    const dateInput = str(body.date);
    const date = toIsoDate(dateInput, `${month.year}-${String(month.month).padStart(2, "0")}-01`);
    if (!isValidIso(date)) throw new AuthError("bad-request", "সঠিক তারিখ দিন", 400);

    const rawEntries = Array.isArray(body.entries) ? (body.entries as unknown[]) : [];
    const entries = rawEntries
      .map((e) => {
        const item = (e ?? {}) as Record<string, unknown>;
        return { memberId: str(item.memberId), meals: num(item.meals, NaN) };
      })
      .filter((e) => e.memberId);
    for (const e of entries) {
      if (!Number.isFinite(e.meals)) throw new AuthError("bad-request", "মিল সংখ্যা সঠিক নয়", 400);
      if (e.meals < 0) throw new AuthError("bad-request", "মিল ঋণাত্মক হতে পারবে না", 400);
      if (e.meals > 100) throw new AuthError("bad-request", "একদিনে ১০০ এর বেশি মিল হতে পারবে না", 400);
    }

    if (!entries.length) throw new AuthError("bad-request", "কমপক্ষে একজন সদস্যের মিল দিন", 400);

    const result = await saveDayMeals(officeId, month, date, entries, ctx.user.name);
    await logAction(ctx, "meals.saveDay", "meal", date, `${date} তারিখের মিল সংরক্ষণ (${entries.length} জন)`, month.id);
    return result;
  },

  "meal.set": async (ctx, body) => {
    if (!can(ctx.user.role, "meals.write")) deny(ctx, "meals.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const memberId = str(body.memberId);
    const day = Math.trunc(num(body.day, 0));
    const meals = num(body.meals, NaN);
    if (!memberId || day < 1 || day > month.totalDays) throw new AuthError("bad-request", "সদস্য ও দিন সঠিক দিন", 400);
    if (!Number.isFinite(meals) || meals < 0) throw new AuthError("bad-request", "মিল ০ বা তার বেশি হতে হবে", 400);
    if (meals > 100) throw new AuthError("bad-request", "একদিনে ১০০ এর বেশি মিল হতে পারবে না", 400);
    await setMeal(officeId, month, memberId, day, meals, ctx.user.name);
    await logAction(ctx, "meal.set", "meal", `${month.id}:${memberId}:${day}`, `দিন ${day} → ${num(body.meals, 0)} মিল`, month.id);
    return { ok: true };
  },

  "meal.delete": async (ctx, body) => {
    if (!can(ctx.user.role, "meals.write")) deny(ctx, "meals.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const deleted = await deleteMeal(officeId, str(body.id));
    await logAction(ctx, "meal.delete", "meal", str(body.id), "মিল এন্ট্রি মুছে ফেলা হয়েছে", month.id);
    return { deleted };
  },

  /* ── bazar ───────────────────────────────────────────── */
  "bazar.list": async (ctx, body) => {
    if (!can(ctx.user.role, "bazar.view")) deny(ctx, "bazar.view");
    const { officeId, month } = await resolveMonth(ctx, body);
    const rows = await listBazar(officeId, month.id);
    return rows.map(bazarDTO);
  },

  "bazar.create": async (ctx, body) => {
    if (!can(ctx.user.role, "bazar.write")) deny(ctx, "bazar.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const created = await createBazar(
      officeId,
      month,
      {
        date: str(body.date),
        buyerName: str(body.buyerName).slice(0, 80),
        memberId: str(body.memberId) || null,
        paidByMemberId: str(body.paidByMemberId).slice(0, 64) || null,
        category: normalizeCategory(str(body.category)),
        items: str(body.items).slice(0, 300),
        lines: parseLines(body.lines),
        amount: num(body.amount, 0),
        note: str(body.note).slice(0, 300),
      },
      ctx.user.name,
    );
    await logAction(ctx, "bazar.create", "bazar", created.id, `বাজার: ৳${created.amount} (${created.buyerName})`, month.id);
    return bazarDTO(created);
  },

  "bazar.update": async (ctx, body) => {
    if (!can(ctx.user.role, "bazar.write")) deny(ctx, "bazar.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const updated = need(
      await updateBazar(officeId, month, str(body.id), {
        date: str(body.date),
        buyerName: str(body.buyerName).slice(0, 80),
        memberId: str(body.memberId) || null,
        paidByMemberId: str(body.paidByMemberId).slice(0, 64) || null,
        category: normalizeCategory(str(body.category)),
        items: str(body.items).slice(0, 300),
        lines: parseLines(body.lines),
        amount: num(body.amount, 0),
        note: str(body.note).slice(0, 300),
      }),
      "বাজার এন্ট্রি পাওয়া যায়নি",
    );
    await logAction(ctx, "bazar.update", "bazar", updated.id, `বাজার হালনাগাদ: ৳${updated.amount}`, month.id);
    return bazarDTO(updated);
  },

  "bazar.delete": scopedDelete("bazar", "bazar.write", "বাজার এন্ট্রি মুছে ফেলা হয়েছে"),

  /* ── fund / deposits ─────────────────────────────────── */
  "deposits.list": async (ctx, body) => {
    if (!can(ctx.user.role, "fund.view")) deny(ctx, "fund.view");
    const { officeId, month } = await resolveMonth(ctx, body);
    const rows = await listDeposits(officeId, month.id);
    return rows.map(depositDTO);
  },

  "deposit.create": async (ctx, body) => {
    if (!can(ctx.user.role, "fund.write")) deny(ctx, "fund.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const created = await createDeposit(
      officeId,
      month,
      {
        date: str(body.date),
        memberId: str(body.memberId) || null,
        memberName: str(body.memberName).slice(0, 80),
        amount: num(body.amount, 0),
        note: str(body.note).slice(0, 300),
        type: str(body.type, "permanent_fund") || "permanent_fund",
      },
      ctx.user.name,
    );
    await logAction(ctx, "deposit.create", "deposit", created.id, `জমা: ৳${created.amount} (${created.memberName})`, month.id);
    return depositDTO(created);
  },

  "deposit.update": async (ctx, body) => {
    if (!can(ctx.user.role, "fund.write")) deny(ctx, "fund.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const existing = need(await getDeposit(officeId, str(body.id)), "জমা এন্ট্রি পাওয়া যায়নি");
    if ((existing.createdBy ?? "") === "system:carry-forward") {
      throw new AuthError("forbidden", "স্বয়ংক্রিয় ক্যারি-ফরোয়ার্ড জমা/ফান্ড সরাসরি বদলানো যায় না; সংশোধনের জন্য মাস রিওপেন করুন", 403);
    }
    const updated = need(
      await updateDeposit(officeId, month, str(body.id), {
        date: str(body.date),
        memberId: str(body.memberId) || null,
        memberName: str(body.memberName).slice(0, 80),
        amount: num(body.amount, 0),
        note: str(body.note).slice(0, 300),
        type: str(body.type, "permanent_fund") || "permanent_fund",
      }),
      "জমা এন্ট্রি পাওয়া যায়নি",
    );
    await logAction(ctx, "deposit.update", "deposit", updated.id, `জমা হালনাগাদ: ৳${updated.amount}`, month.id);
    return depositDTO(updated);
  },

  "deposit.delete": async (ctx, body) => {
    if (!can(ctx.user.role, "fund.write")) deny(ctx, "fund.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const id = str(body.id);
    if (!id) throw new AuthError("bad-request", "এন্ট্রি আইডি আবশ্যক", 400);
    const existing = await getDeposit(officeId, id);
    if (!existing) throw new AuthError("not-found", "এন্ট্রি পাওয়া যায়নি", 404);
    if ((existing.createdBy ?? "") === "system:carry-forward") {
      throw new AuthError("forbidden", "স্বয়ংক্রিয় ক্যারি-ফরোয়ার্ড জমা/ফান্ড সরাসরি মোছা যায় না; সংশোধনের জন্য মাস রিওপেন করুন", 403);
    }
    const deleted = await deleteDeposit(officeId, id);
    if (!deleted) throw new AuthError("not-found", "এন্ট্রি পাওয়া যায়নি", 404);
    await logAction(ctx, "deposit.delete", "deposit", id, "জমা এন্ট্রি মুছে ফেলা হয়েছে", month.id);
    return { deleted, id };
  },

  /* ── other income ────────────────────────────────────── */
  "incomes.list": async (ctx, body) => {
    if (!can(ctx.user.role, "income.view")) deny(ctx, "income.view");
    const { officeId, month } = await resolveMonth(ctx, body);
    const rows = await listIncomes(officeId, month.id);
    return rows.map(incomeDTO);
  },

  "income.create": async (ctx, body) => {
    if (!can(ctx.user.role, "income.write")) deny(ctx, "income.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const created = await createIncome(
      officeId,
      month,
      { date: str(body.date), title: str(body.title).slice(0, 120), amount: num(body.amount, 0), note: str(body.note).slice(0, 300) },
      ctx.user.name,
    );
    await logAction(ctx, "income.create", "income", created.id, `অন্যান্য আয়: ৳${created.amount}`, month.id);
    return incomeDTO(created);
  },

  "income.update": async (ctx, body) => {
    if (!can(ctx.user.role, "income.write")) deny(ctx, "income.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const updated = need(
      await updateIncome(officeId, month, str(body.id), {
        date: str(body.date),
        title: str(body.title).slice(0, 120),
        amount: num(body.amount, 0),
        note: str(body.note).slice(0, 300),
      }),
      "আয় এন্ট্রি পাওয়া যায়নি",
    );
    await logAction(ctx, "income.update", "income", updated.id, `আয় হালনাগাদ: ৳${updated.amount}`, month.id);
    return incomeDTO(updated);
  },

  "income.delete": scopedDelete("income", "income.write", "আয় এন্ট্রি মুছে ফেলা হয়েছে"),

  /* ── extra expenses ──────────────────────────────────── */
  "extras.list": async (ctx, body) => {
    if (!can(ctx.user.role, "extras.view")) deny(ctx, "extras.view");
    const { officeId, month } = await resolveMonth(ctx, body);
    const rows = await listExtras(officeId, month.id);
    return rows.map(extraDTO);
  },

  "extra.create": async (ctx, body) => {
    if (!can(ctx.user.role, "extras.write")) deny(ctx, "extras.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const created = await createExtra(
      officeId,
      month,
      {
        date: str(body.date),
        title: str(body.title).slice(0, 120),
        amount: num(body.amount, 0),
        type: str(body.type) === "individual" ? "individual" : "shared",
        memberId: str(body.memberId) || null,
        paidByMemberId: str(body.paidByMemberId) || null,
        note: str(body.note).slice(0, 300),
      },
      ctx.user.name,
    );
    await logAction(ctx, "extra.create", "extra", created.id, `অতিরিক্ত খরচ (${created.type}): ৳${created.amount}`, month.id);
    return extraDTO(created);
  },

  "extra.update": async (ctx, body) => {
    if (!can(ctx.user.role, "extras.write")) deny(ctx, "extras.write");
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const updated = need(
      await updateExtra(officeId, month, str(body.id), {
        date: str(body.date),
        title: str(body.title).slice(0, 120),
        amount: num(body.amount, 0),
        type: str(body.type) === "individual" ? "individual" : "shared",
        memberId: str(body.memberId) || null,
        paidByMemberId: str(body.paidByMemberId) || null,
        note: str(body.note).slice(0, 300),
      }),
      "অতিরিক্ত খরচ পাওয়া যায়নি",
    );
    await logAction(ctx, "extra.update", "extra", updated.id, `অতিরিক্ত খরচ হালনাগাদ: ৳${updated.amount}`, month.id);
    return extraDTO(updated);
  },

  "extra.delete": scopedDelete("extra", "extras.write", "অতিরিক্ত খরচ মুছে ফেলা হয়েছে"),

  /* ── report ──────────────────────────────────────────── */
  "report.summary": async (ctx, body) => {
    if (!can(ctx.user.role, "report.view")) deny(ctx, "report.view");
    const { officeId, month } = await resolveMonth(ctx, body);
    const fromDate = str(body.fromDate) ? toIsoDate(str(body.fromDate)) : null;
    const toDate = str(body.toDate) ? toIsoDate(str(body.toDate)) : null;
    const result = await getMonthSummary(officeId, month.id, fromDate && toDate ? { fromDate, toDate } : undefined);
    const scoped = scopeCalcs(ctx, result.summary.memberCalculations);
    const office = await getOffice(officeId);
    return {
      office: office ? officeDTO(office) : null,
      month: monthDTO(month),
      fromDate,
      toDate,
      summary: { ...result.summary, memberCalculations: scoped.rows },
      data: result.data,
      selfOnly: Boolean(scoped.self),
      generatedAt: new Date().toISOString(),
    };
  },

  /* ── google sheets ───────────────────────────────────── */
  "sheet.status": async (ctx) => {
    if (!can(ctx.user.role, "sheet.view")) deny(ctx, "sheet.view");
    const office = await loadOfficePayload(ctx);
    const logs = await listSyncLogs(office.id, 15);
    const scriptUrl = resolveScriptUrl(office);
    return {
      scriptUrlConfigured: Boolean(scriptUrl),
      scriptUrl: ctx.user.role === "admin" || ctx.user.role === "manager" ? scriptUrl : "",
      sheetUrl: office.sheetUrl,
      sheetId: office.sheetId,
      lastSyncedAt: office.lastSyncedAt ? office.lastSyncedAt.toISOString() : null,
      autoSync: autoSyncEnabled(),
      logs,
    };
  },

  "sheet.payload": async (ctx, body) => {
    if (!can(ctx.user.role, "sheet.view")) deny(ctx, "sheet.view");
    const office = await loadOfficePayload(ctx);
    const { month } = await resolveMonth(ctx, body);
    const { data, summary } = await getMonthSummary(office.id, month.id);
    return buildSyncPayload(officeDTO(office), data, summary);
  },

  "sheet.sync": async (ctx, body) => {
    if (!can(ctx.user.role, "sheet.sync")) deny(ctx, "sheet.sync");
    const office = await loadOfficePayload(ctx);
    const { month } = await resolveMonth(ctx, body);
    const { data, summary } = await getMonthSummary(office.id, month.id);
    const result = await runFullSync({
      office: officeDTO(office),
      data,
      summary,
      trigger: "manual",
      userId: ctx.user.id,
      scriptUrl: str(body.scriptUrl) || undefined,
    });
    await logAction(
      ctx,
      "sheet.sync",
      "sheet",
      month.id,
      result.ok ? "Google Sheets full sync OK" : `Sync failed: ${result.message}`,
      month.id,
    );
    return result;
  },

  "sheet.ping": async (ctx) => {
    if (!can(ctx.user.role, "sheet.view")) deny(ctx, "sheet.view");
    const office = await loadOfficePayload(ctx);
    return pingScript(resolveScriptUrl(office));
  },

  /* ── audit trail ─────────────────────────────────────── */
  "audit.list": async (ctx, body) => {
    if (!can(ctx.user.role, "audit.view")) deny(ctx, "audit.view");
    if (ctx.user.role === "admin" && str(body.scope) === "all") return listAllAuditLogs(150);
    const office = await loadOfficePayload(ctx);
    return listAuditLogs(office.id, 150);
  },

  /* ── support chat (যেকোনো লগইন-করা ব্যবহারকারী → অ্যাডমিন) ── */
  "support.unread": async (ctx) => {
    await ensureSupportTable();
    if (ctx.user.role === "admin") return unreadForAdmin();
    return { count: await unreadForUser(ctx.user.userId) };
  },

  "support.send": async (ctx, body) => {
    await ensureSupportTable();
    const text = str(body.message ?? body.body).trim().slice(0, 2000);
    if (text.length < 2) throw new AuthError("bad-request", "বার্তা লিখুন (অন্তত ২ অক্ষর)", 400);
    const msg = await insertSupportMessage({
      user: ctx.user,
      officeId: ctx.activeOfficeId ?? "",
      officeName: ctx.office?.name ?? "",
      sender: "user",
      body: text,
    });
    await logAction(ctx, "support.send", "support", msg.id, `অ্যাডমিনকে বার্তা: ${text.slice(0, 80)}`);
    return msg;
  },

  "support.mine": async (ctx) => {
    await ensureSupportTable();
    const msgs = await listSupportMine(ctx.user.userId);
    await markRepliesRead(ctx.user.userId);
    return msgs;
  },

  "support.threads": async (ctx) => {
    await ensureSupportTable();
    if (ctx.user.role !== "admin") deny(ctx, "office.manage");
    return listSupportThreads();
  },

  "support.thread": async (ctx, body) => {
    await ensureSupportTable();
    if (ctx.user.role !== "admin") deny(ctx, "office.manage");
    const userId = str(body.userId);
    if (!userId) throw new AuthError("bad-request", "থ্রেড নির্বাচন করুন", 400);
    return openSupportThread(userId);
  },

  "support.reply": async (ctx, body) => {
    await ensureSupportTable();
    if (ctx.user.role !== "admin") deny(ctx, "office.manage");
    const userId = str(body.userId);
    const text = str(body.message ?? body.body).trim().slice(0, 2000);
    if (!userId) throw new AuthError("bad-request", "থ্রেড নির্বাচন করুন", 400);
    if (text.length < 2) throw new AuthError("bad-request", "উত্তর লিখুন", 400);
    const prior = await listSupportMine(userId);
    const first = prior[0];
    const msg = await insertSupportMessage({
      user: ctx.user,
      officeId: first?.officeId ?? "",
      officeName: first?.officeName ?? "",
      sender: "admin",
      body: text,
      targetUserId: userId,
      targetName: first?.userName ?? "",
      targetRole: first?.role ?? "",
    });
    await logAction(ctx, "support.reply", "support", msg.id, `${first?.userName ?? userId}-কে উত্তর: ${text.slice(0, 80)}`);
    return msg;
  },

  /* ── platform admin ──────────────────────────────────── */
  "admin.offices.list": async (ctx) => {
    if (!can(ctx.user.role, "office.manage")) deny(ctx, "office.manage");
    const rows = await listOffices();
    const enriched = await Promise.all(
      rows.map(async (o) => {
        const months = await db.select().from(messMonths).where(eq(messMonths.officeId, o.id));
        const managers = await db
          .select()
          .from(users)
          .where(and(eq(users.officeId, o.id), eq(users.role, "manager")));
        const memberCount = await db.select().from(users).where(and(eq(users.officeId, o.id), eq(users.role, "member")));
        return {
          ...officeDTO(o),
          monthCount: months.length,
          managerNames: managers.map((m) => m.name).join(", "),
          userCount: managers.length + memberCount.length,
        };
      }),
    );
    return enriched;
  },

  "admin.office.create": async (ctx, body) => {
    if (!can(ctx.user.role, "office.manage")) deny(ctx, "office.manage");
    const name = str(body.name);
    if (name.length < 2) throw new AuthError("bad-request", "অফিসের নাম লিখুন", 400);

    // ঐচ্ছিক: একই ধাপে ম্যানেজারের লগইনও তৈরি করা যায় (আলাদা করে ইউজার ট্যাবে যেতে হয় না)।
    // অফিস বানানোর *আগেই* যাচাই করে নিই, যাতে ব্যর্থ হলে অর্ধেক-তৈরি অফিস পড়ে না থাকে।
    const managerUserId = str(body.managerUserId);
    const managerPassword = str(body.managerPassword);
    if (managerUserId) {
      if (managerUserId.length < 4)
        throw new AuthError("bad-request", "ম্যানেজারের User ID কমপক্ষে ৪ অক্ষরের হতে হবে", 400);
      if (managerPassword.length < 4)
        throw new AuthError("bad-request", "ম্যানেজারের পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে", 400);
      if (await findUserByLogin(managerUserId))
        throw new ServiceError("এই User ID দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে — ম্যানেজারের জন্য ভিন্ন নম্বর দিন", 409, {
          managerUserId: "ইতিমধ্যে ব্যবহৃত",
        });
    }

    const { adminSaveOffice } = await import("@/lib/service");
    const office = await adminSaveOffice({
      name,
      branch: str(body.branch),
      code: str(body.code).toUpperCase() || undefined,
      address: str(body.address),
      managerName: str(body.managerName),
      managerEmail: str(body.managerEmail),
      managerPhone: str(body.managerPhone),
      status: normalizeOfficeStatus(str(body.status)),
      sheetUrl: str(body.sheetUrl),
      scriptUrl: str(body.scriptUrl),
      note: str(body.note),
    });

    let managerId = "";
    if (office && managerUserId) {
      try {
        const manager = await createUser({
          userId: managerUserId,
          name: str(body.managerName) || name,
          email: str(body.managerEmail).toLowerCase(),
          phone: str(body.managerPhone) || managerUserId,
          branch: str(body.branch),
          officeId: office.id,
          role: "manager",
          status: "active",
          password: managerPassword,
        });
        managerId = manager.id;
        await logAction(ctx, "admin.user.create", "user", manager.id, `অফিসের সাথে ম্যানেজার তৈরি: ${manager.name} (${manager.userId})`);
      } catch (err) {
        // অফিসটা রেখে দিয়ে অর্ধেক অবস্থা ফেলে রাখব না — ক্ষতিপূরণ হিসেবে সদ্য তৈরি অফিস মুছে দিই
        await db.delete(offices).where(eq(offices.id, office.id));
        throw err;
      }
    }

    await logAction(ctx, "admin.office.create", "office", office?.id ?? "", `অফিস তৈরি/হালনাগাদ: ${name}`);
    return office ? { ...officeDTO(office), managerId } : null;
  },

  "admin.office.update": async (ctx, body) => {
    if (!can(ctx.user.role, "office.manage")) deny(ctx, "office.manage");
    const id = str(body.id);
    need(await getOffice(id), "অফিস পাওয়া যায়নি");
    const updated = await updateOffice(id, {
      name: str(body.name) || undefined,
      branch: body.branch === undefined ? undefined : str(body.branch),
      code: str(body.code).toUpperCase() || undefined,
      address: body.address === undefined ? undefined : str(body.address),
      managerName: body.managerName === undefined ? undefined : str(body.managerName),
      managerEmail: body.managerEmail === undefined ? undefined : str(body.managerEmail),
      managerPhone: body.managerPhone === undefined ? undefined : str(body.managerPhone),
      status: body.status === undefined ? undefined : normalizeOfficeStatus(str(body.status)),
      sheetUrl: body.sheetUrl === undefined ? undefined : str(body.sheetUrl),
      sheetId: body.sheetUrl === undefined ? undefined : extractSheetId(str(body.sheetUrl)),
      scriptUrl: body.scriptUrl === undefined ? undefined : str(body.scriptUrl),
      note: body.note === undefined ? undefined : str(body.note),
      isDefault: body.isDefault === undefined ? undefined : Boolean(body.isDefault),
    });
    await logAction(ctx, "admin.office.update", "office", id, `অফিস হালনাগাদ: ${updated?.name ?? id}`);
    return updated ? officeDTO(updated) : null;
  },

  "admin.office.status": async (ctx, body) => {
    if (!can(ctx.user.role, "office.manage")) deny(ctx, "office.manage");
    const id = str(body.id);
    const status = normalizeOfficeStatus(str(body.status));
    const updated = await setOfficeStatus(id, status);
    await logAction(ctx, "admin.office.status", "office", id, `অফিস স্ট্যাটাস → ${status}`);
    return updated ? officeDTO(updated) : null;
  },

  "admin.office.delete": async (ctx, body) => {
    if (!can(ctx.user.role, "office.manage")) deny(ctx, "office.manage");
    if (ctx.user.role !== "admin") deny(ctx, "office.manage");
    const id = str(body.id);
    const office = need(await getOffice(id), "অফিস পাওয়া যায়নি");
    if (body.confirm !== office.name && body.confirm !== office.code) {
      throw new AuthError("bad-request", "নিশ্চিত করতে অফিসের নাম বা কোড হুবহু লিখুন", 400);
    }
    await db.delete(offices).where(eq(offices.id, id)); // cascades users/months/data
    await logAction(ctx, "admin.office.delete", "office", id, `অফিস মুছে ফেলা হয়েছে: ${office.name}`, undefined, {
      dangerous: true,
    });
    return { deleted: true, id };
  },

  "admin.users.list": async (ctx) => {
    if (!can(ctx.user.role, "user.manage") && !can(ctx.user.role, "members.approve")) deny(ctx, "user.manage");
    const rows = ctx.user.role === "admin" ? await listUsers(null) : await listUsers(ctx.activeOfficeId);
    const officeRows = await listOffices();
    const officeName = new Map(officeRows.map((o) => [o.id, o.name]));
    const showPasswords = String(process.env.SHOW_PASSWORDS_IN_ADMIN ?? "0") === "1";
    return rows.map((u) => ({
      id: u.id,
      userId: u.userId,
      name: u.name,
      email: u.email,
      phone: u.phone,
      branch: u.branch,
      officeId: u.officeId,
      officeName: u.officeId ? officeName.get(u.officeId) ?? "" : "— platform —",
      role: u.role,
      status: u.status,
      lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      passwordHashed: u.password.startsWith("$2"),
      ...(showPasswords ? { passwordPlain: u.password.startsWith("$2") ? "(hashed)" : u.password } : {}),
    }));
  },

  "admin.user.create": async (ctx, body) => {
    if (!can(ctx.user.role, "user.manage")) deny(ctx, "user.manage");
    const userId = str(body.userId);
    if (userId.length < 4) throw new AuthError("bad-request", "User ID কমপক্ষে ৪ অক্ষরের হতে হবে", 400);
    if (await findUserByLogin(userId)) throw new ServiceError("এই User ID আগেই ব্যবহৃত হয়েছে", 409);
    const officeId = ctx.user.role === "admin" ? str(body.officeId) || null : ctx.activeOfficeId;
    const role = normalizeRole(str(body.role));
    if (role === "admin" && ctx.user.role !== "admin") deny(ctx, "user.manage");
    // শুধু প্ল্যাটফর্ম admin-এর officeId null হতে পারে। manager/member/audit অবশ্যই একটা অফিসে যুক্ত
    // থাকবে — না হলে অফিসবিহীন ইউজার তৈরি হয়, যার কোনো ডেটা-অ্যাক্সেস নেই আর রিপোর্টেও আসে না।
    if (role !== "admin" && !officeId)
      throw new AuthError(
        "office-required",
        "এই রোলের জন্য অফিস নির্বাচন করা আবশ্যক (অফিসবিহীন হতে পারে শুধু প্ল্যাটফর্ম admin)",
        400,
      );
    // দুর্বল ডিফল্ট পাসওয়ার্ড ("1234") আর দেওয়া হবে না — নতুন ইউজারের পাসওয়ার্ড বাধ্যতামূলক।
    const password = str(body.password);
    if (password.length < 4) throw new AuthError("bad-request", "পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে", 400);
    const created = await createUser({
      userId,
      name: str(body.name) || userId,
      email: str(body.email).toLowerCase(),
      phone: str(body.phone),
      branch: str(body.branch),
      officeId,
      role,
      status: normalizeUserStatus(str(body.status), role),
      password,
    });
    await logAction(ctx, "admin.user.create", "user", created.id, `নতুন ইউজার: ${created.name} (${role})`);
    return { id: created.id, userId: created.userId, name: created.name, role: created.role, status: created.status, officeId: created.officeId };
  },

  "admin.user.update": async (ctx, body) => {
    if (!can(ctx.user.role, "user.manage")) deny(ctx, "user.manage");
    const id = str(body.id);
    const target = need(await getUserById(id), "ইউজার পাওয়া যায়নি");
    if (ctx.user.role !== "admin" && target.officeId !== ctx.activeOfficeId) deny(ctx, "user.manage");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = str(body.name).slice(0, 80);
    if (body.email !== undefined) patch.email = str(body.email).toLowerCase().slice(0, 160);
    if (body.phone !== undefined) patch.phone = str(body.phone).slice(0, 20);
    if (body.branch !== undefined) patch.branch = str(body.branch).slice(0, 60);
    if (body.userId !== undefined) {
      const next = str(body.userId);
      if (next.length < 4) throw new AuthError("bad-request", "User ID কমপক্ষে ৪ অক্ষরের হতে হবে", 400);
      const clash = await findUserByLogin(next);
      if (clash && clash.id !== id) throw new ServiceError("এই User ID আগেই ব্যবহৃত হয়েছে", 409);
      patch.userId = next;
    }
    if (body.role !== undefined) {
      const role = normalizeRole(str(body.role));
      if (ctx.user.role !== "admin" && role === "admin") deny(ctx, "user.manage");
      patch.role = role;
    }
    if (body.status !== undefined) patch.status = normalizeUserStatus(str(body.status), target.role);
    if (body.officeId !== undefined && ctx.user.role === "admin") patch.officeId = str(body.officeId) || null;
    // হালনাগাদের ফলে যেন কোনো manager/member/audit অফিসবিহীন না হয়ে পড়ে
    const nextRole = (patch.role as string | undefined) ?? target.role;
    const nextOfficeId = "officeId" in patch ? (patch.officeId as string | null) : target.officeId;
    if (nextRole !== "admin" && !nextOfficeId)
      throw new AuthError("office-required", "এই রোলের জন্য অফিস আবশ্যক — ইউজারকে অফিসবিহীন করা যাবে না", 400);

    const rows = await db.update(users).set(patch).where(eq(users.id, id)).returning();
    const updated = rows[0]!;
    if (updated.status === "approved" && target.status !== "approved") {
      const { syncUserToRosters } = await import("@/lib/mess-data");
      await syncUserToRosters(updated);
    }
    await logAction(ctx, "admin.user.update", "user", id, `ইউজার হালনাগাদ: ${updated.name}`);
    return { id: updated.id, userId: updated.userId, name: updated.name, role: updated.role, status: updated.status, officeId: updated.officeId };
  },

  "admin.user.status": async (ctx, body) => {
    if (!can(ctx.user.role, "user.manage") && !can(ctx.user.role, "members.approve")) deny(ctx, "user.manage");
    const id = str(body.id);
    const status = normalizeUserStatus(str(body.status), "member");
    const target = need(await getUserById(id), "ইউজার পাওয়া যায়নি");
    // non-admins may only manage users of their own office, and never other admins
    if (ctx.user.role !== "admin") {
      if (target.officeId !== ctx.activeOfficeId) deny(ctx, "user.manage");
      if (target.role === "admin") deny(ctx, "user.manage");
      if (!can(ctx.user.role, "user.manage") && target.role === "manager") deny(ctx, "user.manage");
    }
    if (target.id === ctx.user.id && (status === "inactive" || status === "rejected")) {
      throw new AuthError("bad-request", "নিজের অ্যাকাউন্ট নিষ্ক্রিয় করা যাবে না", 400);
    }
    const updated = await setUserStatus(id, status, ctx.user.role === "admin" ? null : ctx.activeOfficeId);
    await logAction(ctx, "admin.user.status", "user", id, `ইউজার স্ট্যাটাস → ${status}`);
    return updated ? { id: updated.id, status: updated.status } : null;
  },

  "admin.user.resetPassword": async (ctx, body) => {
    if (!can(ctx.user.role, "user.manage") && !can(ctx.user.role, "members.approve")) deny(ctx, "user.manage");
    const id = str(body.id);
    const password = str(body.password);
    if (password.length < 4) throw new AuthError("bad-request", "নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে", 400);
    const target = need(await getUserById(id), "ইউজার পাওয়া যায়নি");
    if (ctx.user.role !== "admin" && target.officeId !== ctx.activeOfficeId) deny(ctx, "user.manage");
    const done = await resetUserPassword(id, password);
    // invalidate that user's existing sessions
    await db.delete(sessions).where(eq(sessions.userId, id));
    await logAction(ctx, "admin.user.resetPassword", "user", id, `পাসওয়ার্ড রিসেট: ${target.name}`);
    return { ok: done };
  },

  "admin.user.delete": async (ctx, body) => {
    if (!can(ctx.user.role, "user.manage")) deny(ctx, "user.manage");
    const id = str(body.id);
    const target = need(await getUserById(id), "ইউজার পাওয়া যায়নি");
    if (target.id === ctx.user.id) throw new AuthError("bad-request", "নিজের অ্যাকাউন্ট মুছে ফেলা যাবে না", 400);
    if (ctx.user.role !== "admin") {
      if (target.officeId !== ctx.activeOfficeId) deny(ctx, "user.manage");
      if (target.role === "admin") deny(ctx, "user.manage");
    }
    await db.delete(sessions).where(eq(sessions.userId, id));
    await db.delete(users).where(eq(users.id, id));
    await logAction(ctx, "admin.user.delete", "user", id, `ইউজার মুছে ফেলা হয়েছে: ${target.name}`);
    return { deleted: true, id };
  },

  "admin.pendingUsers": async (ctx) => {
    if (!can(ctx.user.role, "user.manage") && !can(ctx.user.role, "members.approve")) deny(ctx, "user.manage");
    const rows = ctx.user.role === "admin" ? await listUsers(null) : await listUsers(ctx.activeOfficeId);
    return rows
      .filter((u) => u.status === "pending")
      .map((u) => ({ id: u.id, userId: u.userId, name: u.name, phone: u.phone, email: u.email, officeId: u.officeId, createdAt: u.createdAt.toISOString() }));
  },

  "admin.summary": async (ctx) => {
    if (!can(ctx.user.role, "office.manage") && !can(ctx.user.role, "user.manage")) deny(ctx, "office.manage");
    const allOffices = await listOffices();
    const allUsers = await listUsers(null);
    const allMonths = await db.select().from(messMonths);
    const lastSync = await db.select().from(syncLogs).orderBy(desc(syncLogs.at)).limit(10);
    return {
      offices: allOffices.length,
      activeOffices: allOffices.filter((o) => o.status === "active").length,
      inactiveOffices: allOffices.filter((o) => o.status === "inactive").length,
      users: allUsers.length,
      managers: allUsers.filter((u) => u.role === "manager").length,
      members: allUsers.filter((u) => u.role === "member").length,
      pendingUsers: allUsers.filter((u) => u.status === "pending").length,
      months: allMonths.length,
      lastSyncs: lastSync.map((s) => ({ id: s.id, at: s.at.toISOString(), officeId: s.officeId, ok: s.ok, message: s.message })),
      officeList: allOffices.map((o) => ({ id: o.id, name: o.name, branch: o.branch, code: o.code, status: o.status })),
    };
  },

  /* ── self service ────────────────────────────────────── */
  "me.changePassword": async (ctx, body) => {
    const current = str(body.currentPassword);
    const next = str(body.newPassword);
    if (next.length < 4) throw new AuthError("bad-request", "নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে", 400);
    const fresh = need(await getUserById(ctx.user.id), "ইউজার পাওয়া যায়নি");
    const { verifyPassword } = await import("@/lib/password");
    if (!verifyPassword(current, fresh.password)) throw new AuthError("bad-request", "বর্তমান পাসওয়ার্ড সঠিক নয়", 400);
    await resetUserPassword(fresh.id, next);
    await logAction(ctx, "me.changePassword", "user", fresh.id, "নিজের পাসওয়ার্ড পরিবর্তন");
    return { ok: true };
  },

  "office.months": async (ctx, body) => {
    const officeId = ctx.activeOfficeId;
    if (!officeId) throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি", 400);
    void body;
    const now = dhakaNow();
    const list: { year: number; month: number; id: string; label: string; labelBn: string; exists: boolean }[] = [];
    for (let i = 0; i < 18; i++) {
      const { year, month } = addMonths(now.year, now.month, -i);
      const row = await getMonthFor(officeId, year, month);
      list.push({
        year,
        month,
        id: row?.id ?? `${officeId}-${year}-${String(month).padStart(2, "0")}`,
        label: monthLabel(year, month),
        labelBn: monthLabelBn(year, month),
        exists: Boolean(row),
      });
    }
    return list;
  },
};

/* ══════════════════════════════════════════════════════════
 *  small factories / normalizers
 * ══════════════════════════════════════════════════════════ */

async function getUserById(id: string): Promise<User | null> {
  if (!id) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

type DeleteEntity = "bazar" | "deposit" | "income" | "extra";

const DELETE_FN: Record<DeleteEntity, (officeId: string, id: string) => Promise<boolean>> = {
  bazar: deleteBazar,
  deposit: deleteDeposit,
  income: deleteIncome,
  extra: deleteExtra,
};

function scopedDelete(entity: DeleteEntity, capability: Capability, message: string): ActionHandler {
  return async (ctx, body) => {
    if (!can(ctx.user.role, capability)) deny(ctx, capability);
    const { officeId, month } = await resolveMonth(ctx, body);
    assertWritable(ctx, month);
    const id = str(body.id);
    if (!id) throw new AuthError("bad-request", "এন্ট্রি আইডি আবশ্যক", 400);
    const deleted = await DELETE_FN[entity](officeId, id);
    if (!deleted) throw new AuthError("not-found", "এন্ট্রি পাওয়া যায়নি", 404);
    await logAction(ctx, `${entity}.delete`, entity, id, message, month.id);
    return { deleted, id };
  };
}

function normalizeCategory(value: string) {
  const allowed = ["Groceries", "Vegetables", "Meat", "Fish", "Rice", "Oil", "Spices", "Other"] as const;
  type Cat = (typeof allowed)[number];
  const found = allowed.find((a) => a.toLowerCase() === value.toLowerCase());
  return (found ?? "Groceries") as Cat;
}

function normalizeRole(value: string): Role {
  const allowed: Role[] = ["admin", "manager", "member", "audit"];
  return allowed.includes(value as Role) ? (value as Role) : "member";
}

type Role = "admin" | "manager" | "member" | "audit";

function normalizeUserStatus(value: string, role: string) {
  const allowed = ["pending", "approved", "rejected", "inactive", "active"] as const;
  type S = (typeof allowed)[number];
  const found = allowed.find((a) => a === value);
  if (found) return found as S;
  return role === "manager" || role === "admin" ? ("active" as S) : ("pending" as S);
}

function normalizeOfficeStatus(value: string) {
  const allowed = ["pending", "approved", "active", "inactive"] as const;
  type S = (typeof allowed)[number];
  return (allowed.find((a) => a === value) ?? "active") as S;
}

async function emptyMonthData(month: { id: string; officeId: string; year: number; month: number; monthName: string; totalDays: number }): Promise<MessData> {
  return {
    id: month.id,
    officeId: month.officeId,
    year: month.year,
    month: month.month,
    monthName: month.monthName,
    totalDays: month.totalDays,
    isClosed: false,
    carryForwardBalance: 0,
    members: [],
    dailyMeals: [],
    bazarExpenses: [],
    deposits: [],
    otherIncomes: [],
    extraExpenses: [],
  };
}

function emptySummary(): MonthSummary {
  return calculateMonth({
    members: [],
    dailyMeals: [],
    bazarExpenses: [],
    otherIncomes: [],
    deposits: [],
    extraExpenses: [],
  });
}

/* ══════════════════════════════════════════════════════════
 *  ROUTES
 * ══════════════════════════════════════════════════════════ */

const getActionMap: Record<string, string> = {
  bootstrap: "bootstrap",
  data: "month.data",
  summary: "report.summary",
  report: "report.summary",
  meals: "meals.list",
  bazar: "bazar.list",
  deposits: "deposits.list",
  fund: "deposits.list",
  incomes: "incomes.list",
  income: "incomes.list",
  extras: "extras.list",
  members: "members.list",
  months: "months.list",
  sheet: "sheet.status",
  syncLogs: "sheet.status",
  audit: "audit.list",
};

async function dispatch(action: string, ctx: SessionContext, body: Record<string, unknown>) {
  const handler = handlers[action];
  if (!handler) throw new AuthError("unknown-action", `অজানা action: ${action}`, 400);
  return handler(ctx, body);
}

/**
 * যেসব write-এর পর গুগল শিটে স্বয়ংক্রিয় সিংক দরকার — কন্টেন্ট/শিট/অ্যাডমিন
 * অ্যাকশন বাদ (হিসাব-সংক্রান্ত পরিবর্তনগুলোই শুধু শিটে যায়)।
 */
const SHEET_SYNC_ACTIONS = new Set([
  "meals.saveDay",
  "meal.set",
  "meal.delete",
  "bazar.create",
  "bazar.update",
  "bazar.delete",
  "deposit.create",
  "deposit.update",
  "deposit.delete",
  "income.create",
  "income.update",
  "income.delete",
  "extra.create",
  "extra.update",
  "extra.delete",
  "member.create",
  "member.update",
  "member.delete",
  "month.open",
  "month.copyRoster",
]);

/**
 * Write-এর রেসপন্স ব্লক না করে ব্যাকগ্রাউন্ডে গুগল শিট সিংক — শিট কনফিগার
 * থাকলে ও AUTO_SYNC বন্ধ না থাকলে। কোনো ভুল হলেও রেসপন্স/ডেটার ক্ষতি নেই।
 */
function scheduleSheetSync(ctx: SessionContext, body: Record<string, unknown>, result: unknown) {
  if (!autoSyncEnabled() || !ctx.activeOfficeId) return;
  after(async () => {
    try {
      const office = await getOffice(ctx.activeOfficeId as string);
      if (!office || !resolveScriptUrl(office)) return;
      let monthRow: Awaited<ReturnType<typeof getMonth>> = null;
      const explicitId = str(body.monthId);
      if (explicitId) monthRow = await getMonth(explicitId);
      if ((!monthRow || monthRow.officeId !== office.id) && body.year !== undefined) {
        monthRow = await getMonthFor(office.id, Number(body.year), Number(body.month));
      }
      if (!monthRow || monthRow.officeId !== office.id) {
        const ret = (result as { month?: { id?: string } } | null)?.month?.id;
        if (ret) monthRow = await getMonth(ret);
      }
      if (!monthRow || monthRow.officeId !== office.id) {
        monthRow = await ensureCurrentMonth(office.id);
      }
      const { data, summary } = await getMonthSummary(office.id, monthRow.id);
      await maybeAutoSync({ office: officeDTO(office), data, summary, userId: ctx.user.id });
    } catch (err) {
      console.error("[auto-sync] background sync failed (ignored):", (err as Error).message);
    }
  });
}

const POST = api({ auth: true, office: false, limit: "write", auditAction: "mess" }, async (_req: NextRequest, ctx: SessionContext, body) => {
  const action = str(body.action);
  if (!action) return fail("action আবশ্যক", 400, "validation", { action: "আবশ্যক" });
  try {
    const data = await dispatch(action, ctx, body);
    if (SHEET_SYNC_ACTIONS.has(action)) scheduleSheetSync(ctx, body, data);
    return { action, data };
  } catch (err) {
    if (err instanceof ServiceError) return fail(err.message, err.status, "service", err.fields);
    throw err;
  }
});

const GET = api({ auth: true, office: false, limit: "write", auditAction: "mess.read" }, async (req: NextRequest, ctx: SessionContext, body) => {
  const raw = req.nextUrl.searchParams.get("action") ?? "bootstrap";
  const action = getActionMap[raw] ?? raw;
  const merged = { ...body, monthId: req.nextUrl.searchParams.get("monthId") ?? body.monthId, year: req.nextUrl.searchParams.get("year") ?? body.year, month: req.nextUrl.searchParams.get("month") ?? body.month };
  try {
    const data = await dispatch(action, ctx, merged);
    return { action, data };
  } catch (err) {
    if (err instanceof ServiceError) return fail(err.message, err.status, "service", err.fields);
    throw err;
  }
});

export { POST, GET };
