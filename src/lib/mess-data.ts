import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bazarExpenses,
  dailyMeals,
  deposits,
  extraExpenses,
  members as membersTable,
  messMonths,
  offices,
  otherIncomes,
  syncLogs,
  users,
  cryptoId,
  type BazarExpense,
  type DailyMeal,
  type Deposit,
  type ExtraExpense,
  type Member,
  type MessMonth,
  type Office,
  type OtherIncome,
  type User,
} from "@/db/schema";
import {
  buildMonthId,
  daysInMonth,
  dhakaNow,
  isoOfDay,
  isoParts,
  monthLabel,
  toIsoDate,
} from "@/lib/date";
import { calculateMonth, type CalcInput } from "@/lib/calc";
import { round2, toNumber } from "@/lib/format";
import { slugify, ValidationError } from "@/lib/validate";
import type {
  BazarDTO,
  BazarLine,
  DepositDTO,
  ExtraDTO,
  IncomeDTO,
  MealRowDTO,
  MemberDTO,
  MessData,
  MonthDTO,
  MonthSummary,
} from "@/lib/types";

/* ══════════════════════════════════════════════════════════
 *  mappers
 * ══════════════════════════════════════════════════════════ */

export function officeDTO(o: Office) {
  return {
    id: o.id,
    name: o.name,
    branch: o.branch,
    code: o.code,
    managerName: o.managerName,
    managerEmail: o.managerEmail,
    managerPhone: o.managerPhone,
    status: o.status,
    isDefault: o.isDefault,
    sheetUrl: o.sheetUrl,
    sheetId: o.sheetId,
    scriptUrl: o.scriptUrl,
    lastSyncedAt: o.lastSyncedAt ? o.lastSyncedAt.toISOString() : null,
    address: o.address,
    note: o.note,
    createdAt: o.createdAt.toISOString(),
  };
}

export function monthDTO(m: MessMonth): MonthDTO {
  return {
    id: m.id,
    officeId: m.officeId,
    year: m.year,
    month: m.month,
    monthName: m.monthName,
    totalDays: m.totalDays,
    isClosed: m.isClosed,
    carryForwardBalance: toNumber(m.carryForwardBalance),
    note: m.note,
  };
}

export function memberDTO(m: Member): MemberDTO {
  return {
    id: m.id,
    officeId: m.officeId,
    monthId: m.monthId,
    name: m.name,
    role: m.role,
    isActive: m.isActive,
    phone: m.phone,
    note: m.note,
    sortOrder: m.sortOrder,
    createdAt: m.createdAt.toISOString(),
  };
}

export function mealDTO(r: DailyMeal, memberName = ""): MealRowDTO {
  return {
    id: r.id,
    monthId: r.monthId,
    memberId: r.memberId,
    memberName,
    day: r.day,
    date: r.date,
    meals: toNumber(r.meals),
    note: r.note,
  };
}

/** items_json কলাম থেকে আইটেমের লাইনগুলো নিরাপদে পড়া (ভাঙা JSON → খালি তালিকা) */
export function parseBazarLines(raw: string | null | undefined): BazarLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({ item: String(x.item ?? "").slice(0, 60), qty: round2(toNumber(x.qty)), price: round2(toNumber(x.price)) }))
      .filter((l) => l.item || l.qty || l.price)
      .slice(0, 60);
  } catch {
    return [];
  }
}

export function normalizeBazarLines(lines: BazarLine[] | undefined | null): BazarLine[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((l) => ({
      item: String(l?.item ?? "").trim().slice(0, 60),
      qty: Math.max(0, round2(toNumber(l?.qty))),
      price: Math.max(0, round2(toNumber(l?.price))),
    }))
    .filter((l) => l.item.length > 0)
    .slice(0, 60);
}

/** লাইনগুলো থেকে এক লাইনের সারাংশ — পুরনো "items" টেক্সট কলাম ও শিট রিপোর্টের জন্য */
export function bazarLinesSummary(lines: BazarLine[]): string {
  return lines
    .map((l) => `${l.item} ${Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(2)} × ৳${round2(l.price)}`)
    .join(", ")
    .slice(0, 300);
}

export function bazarLinesTotal(lines: BazarLine[]): number {
  return round2(lines.reduce((sum, l) => sum + round2(l.qty * l.price), 0));
}

export function bazarDTO(r: BazarExpense): BazarDTO {
  return {
    id: r.id,
    monthId: r.monthId,
    date: r.date,
    day: r.day,
    memberId: r.memberId,
    buyerName: r.buyerName,
    category: r.category,
    items: r.items,
    lines: parseBazarLines(r.itemsJson),
    amount: toNumber(r.amount),
    note: r.note,
  };
}

export function depositDTO(r: Deposit): DepositDTO {
  return {
    id: r.id,
    monthId: r.monthId,
    date: r.date,
    day: r.day,
    memberId: r.memberId,
    memberName: r.memberName,
    amount: toNumber(r.amount),
    note: r.note,
    type: r.type,
  };
}

export function incomeDTO(r: OtherIncome): IncomeDTO {
  return {
    id: r.id,
    monthId: r.monthId,
    date: r.date,
    day: r.day,
    title: r.title,
    amount: toNumber(r.amount),
    note: r.note,
  };
}

export function extraDTO(r: ExtraExpense): ExtraDTO {
  return {
    id: r.id,
    monthId: r.monthId,
    date: r.date,
    day: r.day,
    title: r.title,
    amount: toNumber(r.amount),
    type: r.type,
    memberId: r.memberId,
    memberName: r.memberName,
    note: r.note,
  };
}

/* ══════════════════════════════════════════════════════════
 *  OFFICES
 * ══════════════════════════════════════════════════════════ */

export async function getOffice(officeId: string): Promise<Office | null> {
  if (!officeId) return null;
  const rows = await db.select().from(offices).where(eq(offices.id, officeId)).limit(1);
  return rows[0] ?? null;
}

export async function listOffices(): Promise<Office[]> {
  return db.select().from(offices).orderBy(asc(offices.name));
}

export async function findOfficeByCode(code: string): Promise<Office | null> {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return null;
  const rows = await db.select().from(offices).where(eq(offices.code, c)).limit(1);
  return rows[0] ?? null;
}

async function uniqueOfficeId(name: string): Promise<string> {
  const base = `office_${slugify(name) || cryptoId("x").slice(0, 8)}`;
  let candidate = base;
  let n = 1;
  for (;;) {
    const existing = await db.select({ id: offices.id }).from(offices).where(eq(offices.id, candidate)).limit(1);
    if (!existing[0]) return candidate;
    n += 1;
    candidate = `${base}_${n}`;
  }
}

async function uniqueOfficeCode(name: string): Promise<string> {
  const base = (slugify(name).replace(/_/g, "").toUpperCase() || "OFFICE").slice(0, 12) || "OFFICE";
  let n = 1;
  for (;;) {
    const code = `${base}${String(n).padStart(2, "0")}`;
    const existing = await db.select({ code: offices.code }).from(offices).where(eq(offices.code, code)).limit(1);
    if (!existing[0]) return code;
    n += 1;
  }
}

export interface CreateOfficeInput {
  name: string;
  branch?: string;
  address?: string;
  managerName?: string;
  managerEmail?: string;
  managerPhone?: string;
  sheetUrl?: string;
  status?: Office["status"];
  isDefault?: boolean;
  id?: string;
  code?: string;
}

export async function createOffice(input: CreateOfficeInput): Promise<Office> {
  const id = input.id ? input.id : await uniqueOfficeId(input.name);
  const code = input.code ? input.code.toUpperCase() : await uniqueOfficeCode(input.name);
  const now = dhakaNow();

  const rows = await db
    .insert(offices)
    .values({
      id,
      name: input.name,
      branch: input.branch ?? "",
      address: input.address ?? "",
      code,
      managerName: input.managerName ?? "",
      managerEmail: input.managerEmail ?? "",
      managerPhone: input.managerPhone ?? "",
      sheetUrl: input.sheetUrl ?? "",
      status: input.status ?? "active",
      isDefault: input.isDefault ?? false,
    })
    .returning();

  const office = rows[0]!;
  // every office starts with its current month already open
  await ensureMonth(office.id, now.year, now.month);
  return office;
}

export async function updateOffice(
  officeId: string,
  patch: Partial<
    Pick<
      Office,
      | "name"
      | "branch"
      | "code"
      | "address"
      | "managerName"
      | "managerEmail"
      | "managerPhone"
      | "status"
      | "isDefault"
      | "sheetUrl"
      | "sheetId"
      | "scriptUrl"
      | "note"
    >
  >,
): Promise<Office | null> {
  const rows = await db
    .update(offices)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(offices.id, officeId))
    .returning();
  return rows[0] ?? null;
}

/* ══════════════════════════════════════════════════════════
 *  MONTHS  (spec §19–§21, §95–§96)
 * ══════════════════════════════════════════════════════════ */

export async function getMonth(monthId: string): Promise<MessMonth | null> {
  const rows = await db.select().from(messMonths).where(eq(messMonths.id, monthId)).limit(1);
  return rows[0] ?? null;
}

export async function getMonthFor(officeId: string, year: number, month: number): Promise<MessMonth | null> {
  const rows = await db
    .select()
    .from(messMonths)
    .where(and(eq(messMonths.officeId, officeId), eq(messMonths.year, year), eq(messMonths.month, month)))
    .limit(1);
  return rows[0] ?? null;
}

/** Create the month row if missing. Idempotent, unique per office+year+month. */
export async function ensureMonth(officeId: string, year: number, month: number): Promise<MessMonth> {
  const existing = await getMonthFor(officeId, year, month);
  if (existing) return existing;

  const id = buildMonthId(officeId, year, month);
  const inserted = await db
    .insert(messMonths)
    .values({
      id,
      officeId,
      year,
      month,
      monthName: monthLabel(year, month),
      totalDays: daysInMonth(year, month),
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return inserted[0];
  const again = await getMonthFor(officeId, year, month);
  if (!again) throw new ValidationError(`মাস তৈরি করা যায়নি: ${id}`);
  return again;
}

export async function listMonths(officeId: string): Promise<MessMonth[]> {
  return db
    .select()
    .from(messMonths)
    .where(eq(messMonths.officeId, officeId))
    .orderBy(desc(messMonths.year), desc(messMonths.month));
}

/**
 * Open a new accounting period (spec §20–§21):
 *  • member roster may be copied from the previous month
 *  • meals always start from 0 — never carried over
 */
export async function openMonth(
  officeId: string,
  year: number,
  month: number,
  opts: { copyMembers?: boolean; carryForwardBalance?: number; note?: string } = {},
): Promise<{ month: MessMonth; copiedMembers: number }> {
  const { copyMembers = true, carryForwardBalance = 0, note = "" } = opts;

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prev = await getMonthFor(officeId, prevYear, prevMonth);

  const created = await ensureMonth(officeId, year, month);

  if (note || carryForwardBalance) {
    const patched = await db
      .update(messMonths)
      .set({ note, carryForwardBalance: String(carryForwardBalance), updatedAt: new Date() })
      .where(eq(messMonths.id, created.id))
      .returning();
    if (patched[0]) Object.assign(created, patched[0]);
  }

  let copiedMembers = 0;
  if (copyMembers) {
    const existing = await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.monthId, created.id));
    if (existing.length === 0) {
      const source = prev
        ? await db
            .select()
            .from(membersTable)
            .where(eq(membersTable.monthId, prev.id))
            .orderBy(asc(membersTable.sortOrder), asc(membersTable.createdAt))
        : [];
      if (source.length) {
        await db.insert(membersTable).values(
          source.map((m, i) => ({
            id: cryptoId("mem"),
            officeId,
            monthId: created.id,
            name: m.name,
            role: m.role,
            isActive: m.isActive,
            phone: m.phone,
            note: m.note,
            password: "",
            sortOrder: m.sortOrder || i + 1,
            joinedAt: new Date(),
          })),
        );
        copiedMembers = source.length;
      }
    }
  }

  return { month: created, copiedMembers };
}

export async function setMonthClosed(monthId: string, officeId: string, closed: boolean): Promise<MessMonth | null> {
  const rows = await db
    .update(messMonths)
    .set({ isClosed: closed, updatedAt: new Date() })
    .where(and(eq(messMonths.id, monthId), eq(messMonths.officeId, officeId)))
    .returning();
  return rows[0] ?? null;
}

/* ══════════════════════════════════════════════════════════
 *  MEMBERS  (spec §22–§23, §120)
 * ══════════════════════════════════════════════════════════ */

export async function listMembers(officeId: string, monthId: string): Promise<Member[]> {
  return db
    .select()
    .from(membersTable)
    .where(and(eq(membersTable.officeId, officeId), eq(membersTable.monthId, monthId)))
    .orderBy(asc(membersTable.sortOrder), asc(membersTable.isActive), asc(membersTable.name));
}

export async function getMember(officeId: string, memberId: string): Promise<Member | null> {
  const rows = await db
    .select()
    .from(membersTable)
    .where(and(eq(membersTable.id, memberId), eq(membersTable.officeId, officeId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createMember(
  officeId: string,
  monthId: string,
  input: { name: string; phone?: string; role?: string; isActive?: boolean; note?: string },
): Promise<Member> {
  const phone = (input.phone ?? "").trim();
  if (phone) {
    const dup = await db
      .select()
      .from(membersTable)
      .where(and(eq(membersTable.monthId, monthId), eq(membersTable.phone, phone)))
      .limit(1);
    if (dup[0]) throw new ValidationError("এই মোবাইল নম্বর দিয়ে এই মাসে ইতিমধ্যে একজন সদস্য আছেন", { phone: "ডুপ্লিকেট" }, 409);
  }
  const maxRows = await db
    .select({ maxOrder: sql<number>`coalesce(max(${membersTable.sortOrder}), 0)` })
    .from(membersTable)
    .where(eq(membersTable.monthId, monthId));
  const rows = await db
    .insert(membersTable)
    .values({
      id: cryptoId("mem"),
      officeId,
      monthId,
      name: input.name,
      phone,
      role: input.role ?? "member",
      isActive: input.isActive ?? true,
      note: input.note ?? "",
      sortOrder: Number(maxRows[0]?.maxOrder ?? 0) + 1,
      joinedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function updateMember(
  officeId: string,
  memberId: string,
  patch: Partial<Pick<Member, "name" | "phone" | "role" | "isActive" | "note">>,
): Promise<Member | null> {
  const rows = await db
    .update(membersTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(membersTable.id, memberId), eq(membersTable.officeId, officeId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteMember(officeId: string, memberId: string): Promise<boolean> {
  const rows = await db
    .delete(membersTable)
    .where(and(eq(membersTable.id, memberId), eq(membersTable.officeId, officeId)))
    .returning({ id: membersTable.id });
  return rows.length > 0;
}

/**
 * সদস্যদের নিজের পছন্দমতো ক্রম সংরক্ষণ করে (members.sort_order)।
 * একই ক্রম সদস্য পেজ ও মিল এন্ট্রি/মাস গ্রিড — সব জায়গায় দেখায়।
 */
export async function reorderMembers(officeId: string, monthId: string, ids: string[]): Promise<number> {
  let saved = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const rows = await db
      .update(membersTable)
      .set({ sortOrder: i + 1, updatedAt: new Date() })
      .where(and(eq(membersTable.id, ids[i]!), eq(membersTable.officeId, officeId), eq(membersTable.monthId, monthId)))
      .returning({ id: membersTable.id });
    if (rows.length) saved += 1;
  }
  return saved;
}

/** Copy the whole roster from one month into another (meals stay 0). */
export async function copyRoster(officeId: string, fromMonthId: string, toMonthId: string): Promise<number> {
  const source = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.monthId, fromMonthId))
    .orderBy(asc(membersTable.sortOrder), asc(membersTable.createdAt));
  if (!source.length) return 0;
  const existing = await db.select({ phone: membersTable.phone, name: membersTable.name }).from(membersTable).where(eq(membersTable.monthId, toMonthId));
  const existingPhones = new Set(existing.map((e) => e.phone).filter(Boolean));
  const existingNames = new Set(existing.map((e) => e.name.toLowerCase()));
  const toInsert = source.filter((m) => !(m.phone && existingPhones.has(m.phone)) && !existingNames.has(m.name.toLowerCase()));
  if (!toInsert.length) return 0;
  const maxRows = await db
    .select({ maxOrder: sql<number>`coalesce(max(${membersTable.sortOrder}), 0)` })
    .from(membersTable)
    .where(eq(membersTable.monthId, toMonthId));
  const base = Number(maxRows[0]?.maxOrder ?? 0);
  await db.insert(membersTable).values(
    toInsert.map((m, i) => ({
      id: cryptoId("mem"),
      officeId,
      monthId: toMonthId,
      name: m.name,
      role: m.role,
      isActive: m.isActive,
      phone: m.phone,
      note: m.note,
      password: "",
      sortOrder: base + i + 1,
      joinedAt: new Date(),
    })),
  );
  return toInsert.length;
}

/**
 * When a joined user is approved we make sure they appear on the member
 * roster of the office's open months (matched by phone).
 */
export async function syncUserToRosters(user: User): Promise<number> {
  if (!user.officeId) return 0;
  const months = await db
    .select()
    .from(messMonths)
    .where(eq(messMonths.officeId, user.officeId))
    .orderBy(desc(messMonths.year), desc(messMonths.month))
    .limit(3);

  let added = 0;
  for (const month of months) {
    const roster = await db.select().from(membersTable).where(eq(membersTable.monthId, month.id));
    const phone = (user.phone ?? "").trim();
    const exists = roster.some(
      (m) => (phone && m.phone === phone) || m.name.toLowerCase() === user.name.toLowerCase(),
    );
    if (exists) continue;
    await db.insert(membersTable).values({
      id: cryptoId("mem"),
      officeId: user.officeId,
      monthId: month.id,
      name: user.name,
      role: user.role === "audit" ? "audit" : "member",
      isActive: true,
      phone,
      note: "joined via app",
      joinedAt: new Date(),
    });
    added += 1;
  }
  return added;
}

/* ══════════════════════════════════════════════════════════
 *  DAILY MEALS  (spec §24–§26)
 * ══════════════════════════════════════════════════════════ */

export async function listMeals(officeId: string, monthId: string): Promise<DailyMeal[]> {
  return db
    .select()
    .from(dailyMeals)
    .where(and(eq(dailyMeals.officeId, officeId), eq(dailyMeals.monthId, monthId)))
    .orderBy(asc(dailyMeals.day));
}

/**
 * Save a whole day of meals. Uses the unique (monthId, memberId, day)
 * constraint so re-saving never creates duplicates (spec §26).
 */
export async function saveDayMeals(
  officeId: string,
  month: MessMonth,
  date: string,
  entries: { memberId: string; meals: number }[],
  actor: string,
): Promise<{ saved: number; total: number }> {
  const iso = toIsoDate(date, isoOfDay(month.year, month.month, 1));
  const parts = isoParts(iso);
  if (parts.year !== month.year || parts.month !== month.month) {
    throw new ValidationError("তারিখ এই মাসের বাইরে");
  }
  const day = parts.day;
  if (day < 1 || day > month.totalDays) throw new ValidationError(`দিন ১–${month.totalDays} এর মধ্যে হতে হবে`);

  const memberIds = entries.map((e) => e.memberId).filter(Boolean);
  if (memberIds.length) {
    const valid = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(and(eq(membersTable.monthId, month.id), inArray(membersTable.id, memberIds)));
    const validIds = new Set(valid.map((v) => v.id));
    for (const id of memberIds) {
      if (!validIds.has(id)) throw new ValidationError("অচেনা সদস্য — ডেটা রিফ্রেশ করুন");
    }
  }

  let saved = 0;
  for (const entry of entries) {
    const meals = Math.max(0, Math.round(toNumber(entry.meals) * 100) / 100);
    if (meals === 0) {
      // remove zero rows so the sheet/report stays clean, and the unique
      // constraint is not polluted with empty entries
      await db
        .delete(dailyMeals)
        .where(
          and(
            eq(dailyMeals.monthId, month.id),
            eq(dailyMeals.memberId, entry.memberId),
            eq(dailyMeals.day, day),
            eq(dailyMeals.officeId, officeId),
          ),
        );
      continue;
    }
    await db
      .insert(dailyMeals)
      .values({
        id: cryptoId("meal"),
        officeId,
        monthId: month.id,
        memberId: entry.memberId,
        day,
        date: iso,
        meals: String(meals),
        createdBy: actor,
      })
      .onConflictDoUpdate({
        target: [dailyMeals.monthId, dailyMeals.memberId, dailyMeals.day],
        set: { meals: String(meals), date: iso, updatedAt: new Date(), createdBy: actor },
      });
    saved += 1;
  }

  const totalRows = await db
    .select({ total: sql<number>`coalesce(sum(${dailyMeals.meals}), 0)::numeric` })
    .from(dailyMeals)
    .where(and(eq(dailyMeals.monthId, month.id), eq(dailyMeals.day, day)));
  return { saved, total: toNumber(totalRows[0]?.total) };
}

export async function setMeal(
  officeId: string,
  month: MessMonth,
  memberId: string,
  day: number,
  meals: number,
  actor: string,
): Promise<void> {
  return void (await saveDayMeals(officeId, month, isoOfDay(month.year, month.month, day), [{ memberId, meals }], actor));
}

export async function deleteMeal(officeId: string, mealId: string): Promise<boolean> {
  const rows = await db
    .delete(dailyMeals)
    .where(and(eq(dailyMeals.id, mealId), eq(dailyMeals.officeId, officeId)))
    .returning({ id: dailyMeals.id });
  return rows.length > 0;
}

/* ══════════════════════════════════════════════════════════
 *  BAZAR  (spec §27–§28)
 * ══════════════════════════════════════════════════════════ */

export async function listBazar(officeId: string, monthId: string): Promise<BazarExpense[]> {
  return db
    .select()
    .from(bazarExpenses)
    .where(and(eq(bazarExpenses.officeId, officeId), eq(bazarExpenses.monthId, monthId)))
    .orderBy(desc(bazarExpenses.date), desc(bazarExpenses.createdAt));
}

export interface BazarInput {
  date: string;
  buyerName?: string;
  memberId?: string | null;
  category?: BazarExpense["category"];
  items?: string;
  /** আইটেম পপআপের লাইনগুলো — দিলে items টেক্সট স্বয়ংক্রিয়ভাবে সারাংশ হয়ে যায় */
  lines?: BazarLine[];
  amount: number;
  note?: string;
}

export async function createBazar(officeId: string, month: MessMonth, input: BazarInput, actor: string): Promise<BazarExpense> {
  const iso = assertDateInMonth(month, input.date);
  const lines = normalizeBazarLines(input.lines);
  const itemsText = (input.items ?? "").trim() || (lines.length ? bazarLinesSummary(lines) : "");
  const rows = await db
    .insert(bazarExpenses)
    .values({
      id: cryptoId("bzr"),
      officeId,
      monthId: month.id,
      date: iso,
      day: isoParts(iso).day,
      memberId: input.memberId ?? null,
      buyerName: input.buyerName ?? "",
      category: input.category ?? "Groceries",
      items: itemsText,
      itemsJson: JSON.stringify(lines),
      amount: String(Math.max(0, input.amount)),
      note: input.note ?? "",
      createdBy: actor,
    })
    .returning();
  return rows[0]!;
}

export async function updateBazar(
  officeId: string,
  month: MessMonth,
  id: string,
  input: BazarInput,
): Promise<BazarExpense | null> {
  const iso = assertDateInMonth(month, input.date);
  const lines = normalizeBazarLines(input.lines);
  const itemsText = (input.items ?? "").trim() || (lines.length ? bazarLinesSummary(lines) : "");
  const rows = await db
    .update(bazarExpenses)
    .set({
      date: iso,
      day: isoParts(iso).day,
      memberId: input.memberId ?? null,
      buyerName: input.buyerName ?? "",
      category: input.category ?? "Groceries",
      items: itemsText,
      itemsJson: JSON.stringify(lines),
      amount: String(Math.max(0, input.amount)),
      note: input.note ?? "",
      updatedAt: new Date(),
    })
    .where(and(eq(bazarExpenses.id, id), eq(bazarExpenses.officeId, officeId), eq(bazarExpenses.monthId, month.id)))
    .returning();
  return rows[0] ?? null;
}

/** Office-scoped deletes — a record of another office can never be removed. */
export async function deleteBazar(officeId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(bazarExpenses)
    .where(and(eq(bazarExpenses.id, id), eq(bazarExpenses.officeId, officeId)))
    .returning({ id: bazarExpenses.id });
  return rows.length > 0;
}

export async function deleteDeposit(officeId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(deposits)
    .where(and(eq(deposits.id, id), eq(deposits.officeId, officeId)))
    .returning({ id: deposits.id });
  return rows.length > 0;
}

export async function deleteIncome(officeId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(otherIncomes)
    .where(and(eq(otherIncomes.id, id), eq(otherIncomes.officeId, officeId)))
    .returning({ id: otherIncomes.id });
  return rows.length > 0;
}

export async function deleteExtra(officeId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(extraExpenses)
    .where(and(eq(extraExpenses.id, id), eq(extraExpenses.officeId, officeId)))
    .returning({ id: extraExpenses.id });
  return rows.length > 0;
}

/* ══════════════════════════════════════════════════════════
 *  DEPOSITS / FUND  (spec §30–§31)
 * ══════════════════════════════════════════════════════════ */

export async function listDeposits(officeId: string, monthId: string): Promise<Deposit[]> {
  return db
    .select()
    .from(deposits)
    .where(and(eq(deposits.officeId, officeId), eq(deposits.monthId, monthId)))
    .orderBy(desc(deposits.date), desc(deposits.createdAt));
}

export interface DepositInput {
  date: string;
  memberId?: string | null;
  memberName?: string;
  amount: number;
  note?: string;
  type?: string;
}

export async function createDeposit(officeId: string, month: MessMonth, input: DepositInput, actor: string): Promise<Deposit> {
  const iso = assertDateInMonth(month, input.date);
  const member = input.memberId ? await getMember(officeId, input.memberId) : null;
  const rows = await db
    .insert(deposits)
    .values({
      id: cryptoId("dep"),
      officeId,
      monthId: month.id,
      date: iso,
      day: isoParts(iso).day,
      memberId: member?.id ?? null,
      memberName: member?.name ?? input.memberName ?? "",
      amount: String(Math.max(0, input.amount)),
      note: input.note ?? "",
      type: input.type ?? "permanent_fund",
      createdBy: actor,
    })
    .returning();
  return rows[0]!;
}

export async function updateDeposit(officeId: string, month: MessMonth, id: string, input: DepositInput): Promise<Deposit | null> {
  const iso = assertDateInMonth(month, input.date);
  const member = input.memberId ? await getMember(officeId, input.memberId) : null;
  const rows = await db
    .update(deposits)
    .set({
      date: iso,
      day: isoParts(iso).day,
      memberId: member?.id ?? null,
      memberName: member?.name ?? input.memberName ?? "",
      amount: String(Math.max(0, input.amount)),
      note: input.note ?? "",
      type: input.type ?? "permanent_fund",
      updatedAt: new Date(),
    })
    .where(and(eq(deposits.id, id), eq(deposits.officeId, officeId), eq(deposits.monthId, month.id)))
    .returning();
  return rows[0] ?? null;
}

/* ══════════════════════════════════════════════════════════
 *  OTHER INCOME  (spec §29)
 * ══════════════════════════════════════════════════════════ */

export async function listIncomes(officeId: string, monthId: string): Promise<OtherIncome[]> {
  return db
    .select()
    .from(otherIncomes)
    .where(and(eq(otherIncomes.officeId, officeId), eq(otherIncomes.monthId, monthId)))
    .orderBy(desc(otherIncomes.date), desc(otherIncomes.createdAt));
}

export interface IncomeInput {
  date: string;
  title?: string;
  amount: number;
  note?: string;
}

export async function createIncome(officeId: string, month: MessMonth, input: IncomeInput, actor: string): Promise<OtherIncome> {
  const iso = assertDateInMonth(month, input.date);
  const rows = await db
    .insert(otherIncomes)
    .values({
      id: cryptoId("inc"),
      officeId,
      monthId: month.id,
      date: iso,
      day: isoParts(iso).day,
      title: input.title ?? "",
      amount: String(Math.max(0, input.amount)),
      note: input.note ?? "",
      createdBy: actor,
    })
    .returning();
  return rows[0]!;
}

export async function updateIncome(officeId: string, month: MessMonth, id: string, input: IncomeInput): Promise<OtherIncome | null> {
  const iso = assertDateInMonth(month, input.date);
  const rows = await db
    .update(otherIncomes)
    .set({
      date: iso,
      day: isoParts(iso).day,
      title: input.title ?? "",
      amount: String(Math.max(0, input.amount)),
      note: input.note ?? "",
      updatedAt: new Date(),
    })
    .where(and(eq(otherIncomes.id, id), eq(otherIncomes.officeId, officeId), eq(otherIncomes.monthId, month.id)))
    .returning();
  return rows[0] ?? null;
}

/* ══════════════════════════════════════════════════════════
 *  EXTRA EXPENSES  (spec §32–§33)
 * ══════════════════════════════════════════════════════════ */

export async function listExtras(officeId: string, monthId: string): Promise<ExtraExpense[]> {
  return db
    .select()
    .from(extraExpenses)
    .where(and(eq(extraExpenses.officeId, officeId), eq(extraExpenses.monthId, monthId)))
    .orderBy(desc(extraExpenses.date), desc(extraExpenses.createdAt));
}

export interface ExtraInput {
  date: string;
  title?: string;
  amount: number;
  type: "shared" | "individual";
  memberId?: string | null;
  note?: string;
}

export async function createExtra(officeId: string, month: MessMonth, input: ExtraInput, actor: string): Promise<ExtraExpense> {
  const iso = assertDateInMonth(month, input.date);
  const member = input.type === "individual" && input.memberId ? await getMember(officeId, input.memberId) : null;
  if (input.type === "individual" && !member) throw new ValidationError("Individual খরচের জন্য সদস্য নির্বাচন করুন");
  const rows = await db
    .insert(extraExpenses)
    .values({
      id: cryptoId("ext"),
      officeId,
      monthId: month.id,
      date: iso,
      day: isoParts(iso).day,
      title: input.title ?? "",
      amount: String(Math.max(0, input.amount)),
      type: input.type,
      memberId: member?.id ?? null,
      memberName: member?.name ?? "",
      note: input.note ?? "",
      createdBy: actor,
    })
    .returning();
  return rows[0]!;
}

export async function updateExtra(officeId: string, month: MessMonth, id: string, input: ExtraInput): Promise<ExtraExpense | null> {
  const iso = assertDateInMonth(month, input.date);
  const member = input.type === "individual" && input.memberId ? await getMember(officeId, input.memberId) : null;
  if (input.type === "individual" && !member) throw new ValidationError("Individual খরচের জন্য সদস্য নির্বাচন করুন");
  const rows = await db
    .update(extraExpenses)
    .set({
      date: iso,
      day: isoParts(iso).day,
      title: input.title ?? "",
      amount: String(Math.max(0, input.amount)),
      type: input.type,
      memberId: member?.id ?? null,
      memberName: member?.name ?? "",
      note: input.note ?? "",
      updatedAt: new Date(),
    })
    .where(and(eq(extraExpenses.id, id), eq(extraExpenses.officeId, officeId), eq(extraExpenses.monthId, month.id)))
    .returning();
  return rows[0] ?? null;
}

/* ══════════════════════════════════════════════════════════
 *  MONTH DATA + SUMMARY
 * ══════════════════════════════════════════════════════════ */

export async function getMonthData(officeId: string, monthId: string): Promise<MessData> {
  const monthRow = await db
    .select()
    .from(messMonths)
    .where(and(eq(messMonths.id, monthId), eq(messMonths.officeId, officeId)))
    .limit(1);
  const month = monthRow[0];
  if (!month) throw new ValidationError("মাস পাওয়া যায়নি", {}, 404);

  const [memberRows, mealRows, bazarRows, depositRows, incomeRows, extraRows] = await Promise.all([
    listMembers(officeId, monthId),
    listMeals(officeId, monthId),
    listBazar(officeId, monthId),
    listDeposits(officeId, monthId),
    listIncomes(officeId, monthId),
    listExtras(officeId, monthId),
  ]);

  const nameById = new Map(memberRows.map((m) => [m.id, m.name]));

  return {
    id: month.id,
    officeId: month.officeId,
    year: month.year,
    month: month.month,
    monthName: month.monthName,
    totalDays: month.totalDays,
    isClosed: month.isClosed,
    carryForwardBalance: toNumber(month.carryForwardBalance),
    members: memberRows.map(memberDTO),
    dailyMeals: mealRows.map((r) => mealDTO(r, nameById.get(r.memberId) ?? "")),
    bazarExpenses: bazarRows.map(bazarDTO),
    deposits: depositRows.map(depositDTO),
    otherIncomes: incomeRows.map(incomeDTO),
    extraExpenses: extraRows.map(extraDTO),
  };
}

export interface SummaryResult {
  data: MessData;
  summary: MonthSummary;
  month: MonthDTO;
  fromDate: string | null;
  toDate: string | null;
}

export async function getMonthSummary(
  officeId: string,
  monthId: string,
  range?: { fromDate?: string | null; toDate?: string | null },
): Promise<SummaryResult> {
  const data = await getMonthData(officeId, monthId);
  const fromDate = range?.fromDate ? toIsoDate(range.fromDate) : null;
  const toDate = range?.toDate ? toIsoDate(range.toDate) : null;

  const input: CalcInput = {
    members: data.members,
    dailyMeals: data.dailyMeals,
    bazarExpenses: data.bazarExpenses,
    otherIncomes: data.otherIncomes,
    deposits: data.deposits,
    extraExpenses: data.extraExpenses,
    fromDate,
    toDate,
    // carry-forward only applies to the un-filtered full month view
    carryForwardBalance: fromDate || toDate ? 0 : data.carryForwardBalance,
  };

  return {
    data,
    summary: calculateMonth(input),
    month: {
      id: data.id,
      officeId: data.officeId,
      year: data.year,
      month: data.month,
      monthName: data.monthName,
      totalDays: data.totalDays,
      isClosed: data.isClosed,
      carryForwardBalance: data.carryForwardBalance,
      note: "",
    },
    fromDate,
    toDate,
  };
}

/* ══════════════════════════════════════════════════════════
 *  USERS (platform admin management, spec §81)
 * ══════════════════════════════════════════════════════════ */

export async function findUserByLogin(login: string): Promise<User | null> {
  const key = (login ?? "").trim();
  if (!key) return null;
  const lower = key.toLowerCase();
  const rows = await db
    .select()
    .from(users)
    .where(or(eq(users.userId, key), eq(users.phone, key), eq(sql`lower(${users.email})`, lower)))
    .limit(3);
  return (
    rows.find((r) => r.userId === key) ??
    rows.find((r) => r.phone === key) ??
    rows.find((r) => r.email.toLowerCase() === lower) ??
    rows[0] ??
    null
  );
}

export async function listUsers(officeId?: string | null): Promise<User[]> {
  const rows = officeId
    ? await db.select().from(users).where(eq(users.officeId, officeId))
    : await db.select().from(users);
  return rows.sort((a, b) => `${a.role}${a.name}`.localeCompare(`${b.role}${b.name}`));
}

export async function getUser(id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/* ══════════════════════════════════════════════════════════
 *  SYNC LOGS (spec §98)
 * ══════════════════════════════════════════════════════════ */

export async function listSyncLogs(officeId: string, limit = 25) {
  const rows = await db
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.officeId, officeId))
    .orderBy(desc(syncLogs.at))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    action: r.action,
    trigger: r.trigger,
    officeId: r.officeId,
    monthId: r.monthId,
    ok: r.ok,
    message: r.message,
    sheetUrl: r.sheetUrl,
    durationMs: r.durationMs,
  }));
}

/* ══════════════════════════════════════════════════════════
 *  small guards
 * ══════════════════════════════════════════════════════════ */

function assertDateInMonth(month: MessMonth, date: string): string {
  const iso = toIsoDate(date, isoOfDay(month.year, month.month, 1));
  const p = isoParts(iso);
  if (p.year !== month.year || p.month !== month.month) {
    throw new ValidationError(`তারিখ অবশ্যই ${month.monthName} মাসের হতে হবে`);
  }
  if (p.day < 1 || p.day > month.totalDays) throw new ValidationError(`দিন ১–${month.totalDays} এর মধ্যে হতে হবে`);
  return iso;
}
