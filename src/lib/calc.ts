/**
 * ══════════════════════════════════════════════════════════════
 *  BUSINESS RULES ENGINE  (spec §30–§38, §85–§88, §121)
 *
 *  Rule 1  Permanent Fund is separate.
 *  Rule 2  Fund is NOT deducted from the monthly meal charge.
 *  Rule 3  Meal rate = (Bazar − Other Income) / Total Meals
 *  Rule 4  Individual Extra goes to the assigned member.
 *  Rule 5  Shared Extra is divided among active members.
 *  Rule 6  Each office has isolated data.
 *  Rule 7  Each month is isolated.
 *  Rule 8  Previous months remain viewable.
 *
 *  ⚠ These rules must never change. Every report, dashboard, PDF,
 *    CSV and Google Sheet is produced by this single module so the
 *    numbers can never drift apart.
 * ══════════════════════════════════════════════════════════════
 */

import { round2, round4, toNumber } from "./format";
import type {
  BazarDTO,
  DepositDTO,
  ExtraDTO,
  IncomeDTO,
  MealRowDTO,
  MemberCalculation,
  MemberDTO,
  MonthSummary,
} from "./types";

export interface CalcInput {
  members: MemberDTO[];
  dailyMeals: MealRowDTO[];
  bazarExpenses: BazarDTO[];
  otherIncomes: IncomeDTO[];
  deposits: DepositDTO[];
  extraExpenses: ExtraDTO[];
  /** optional: restrict the calculation to a date range (report filter) */
  fromDate?: string | null;
  toDate?: string | null;
  /** carried-forward cash balance from the previous month */
  carryForwardBalance?: number;
  /**
   * জের-সমাধান প্রয়োগ হবে কিনা। তারিখ-ফিল্টার দেওয়া আংশিক রিপোর্টে false —
   * আংশিক বাজার দেখে জের মাপা ভুল হবে বলে ওই ভিউতে পুরনো সূত্রই চলে।
   */
  applySettlement?: boolean;
}

const inRange = (date: string, from?: string | null, to?: string | null): boolean => {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

/**
 * Full month summary + per-member calculation.
 */
export function calculateMonth(input: CalcInput): MonthSummary {
  const { fromDate = null, toDate = null } = input;

  const members = (input.members ?? []).filter(Boolean);
  const activeMembers = members.filter((m) => m.isActive !== false);
  const activeCount = activeMembers.length;

  const meals = (input.dailyMeals ?? []).filter((r) => inRange(r.date, fromDate, toDate));
  const bazar = (input.bazarExpenses ?? []).filter((r) => inRange(r.date, fromDate, toDate));
  const incomes = (input.otherIncomes ?? []).filter((r) => inRange(r.date, fromDate, toDate));
  const deposits = (input.deposits ?? []).filter((r) => inRange(r.date, fromDate, toDate));
  const extras = (input.extraExpenses ?? []).filter((r) => inRange(r.date, fromDate, toDate));

  /* ── totals ─────────────────────────────────────────────── */
  const totalMill = round2(meals.reduce((s, r) => s + toNumber(r.meals), 0));
  const totalBazarCost = round2(bazar.reduce((s, r) => s + toNumber(r.amount), 0));
  const totalOthersIncome = round2(incomes.reduce((s, r) => s + toNumber(r.amount), 0));

  // Rule 3 — net meal cost, then meal rate
  const netCost = round2(totalBazarCost - totalOthersIncome);
  const rawRate = totalMill > 0 ? netCost / totalMill : 0;
  const perMillRate = round2(rawRate);

  // Rule 1/2 — permanent fund is capital, tracked separately
  const fundRows = deposits.filter((d) => (d.type || "permanent_fund") === "permanent_fund");
  const totalFund = round2(fundRows.reduce((s, r) => s + toNumber(r.amount), 0));
  const totalDepositsThisMonth = round2(deposits.reduce((s, r) => s + toNumber(r.amount), 0));
  /** জেরের নগদ পরিশোধ (jer_payment) — নগদ বাড়ায়, সদস্য-হিসাবে পৃথক স্তম্ভে দেখানো হয় */
  const totalJerCashAll = round2(
    deposits.filter((d) => (d.type || "") === "jer_payment").reduce((s, r) => s + toNumber(r.amount), 0),
  );
  /**
   * সিস্টেম-ক্যারি-ফরোয়ার্ড adjustment নগদ আনে না (পুরনো মাসের দেনা/পাওনা বহন করে),
   * তাই নগদ গণনায় বাদ — কিন্তু সদস্যের দেনা-পাওনায় স্বাভাবিক সমন্বয় হিসেবে ধরা হয়।
   */
  const totalCarryForwardAdjust = round2(
    deposits
      .filter((d) => (d.createdBy ?? "") === "system:carry-forward")
      .reduce((s, r) => s + toNumber(r.amount), 0),
  );
  /**
   * হাতে আসা প্রকৃত নগদ জমা — স্থায়ী ফান্ড ও সিস্টেম-ক্যারি বাদে সবই
   * (সাধারণ জমা, মাস-শেষ পরিশোধ, জেরের নগদ পরিশোধ)।
   */
  const totalCashCollected = round2(totalDepositsThisMonth - totalFund - totalCarryForwardAdjust);
  /** ফান্ড ও জের-নগদ বাদে সাধারণ জমা/সমন্বয় (পুরোনো সামঞ্জস্য-সংখ্যা) */
  const totalMemberPayments = round2(totalDepositsThisMonth - totalFund - totalJerCashAll);

  // Rule 5 — shared extra split across ACTIVE members
  const totalSharedExtraRaw = extras
    .filter((e) => e.type === "shared")
    .reduce((s, r) => s + toNumber(r.amount), 0);
  const totalSharedExtra = round2(totalSharedExtraRaw);
  const sharedPerMember = activeCount > 0 ? totalSharedExtraRaw / activeCount : 0;

  // Rule 4 — individual extras grouped by member
  const individualByMember = new Map<string, number>();
  for (const e of extras.filter((x) => x.type === "individual")) {
    const key = e.memberId || `name:${(e.memberName || "").trim().toLowerCase()}`;
    individualByMember.set(key, (individualByMember.get(key) ?? 0) + toNumber(e.amount));
  }
  const totalIndividualExtra = round2(
    extras.filter((e) => e.type === "individual").reduce((s, r) => s + toNumber(r.amount), 0),
  );

  // meals per member
  const mealsByMember = new Map<string, number>();
  const mealsByMemberName = new Map<string, number>();
  for (const r of meals) {
    const v = toNumber(r.meals);
    if (r.memberId) mealsByMember.set(r.memberId, (mealsByMember.get(r.memberId) ?? 0) + v);
    const nm = (r.memberName || "").trim().toLowerCase();
    if (nm) mealsByMemberName.set(nm, (mealsByMemberName.get(nm) ?? 0) + v);
  }

  // deposits per member — স্থায়ী ফান্ড সম্পূর্ণ আলাদা খাত, বাকি জমা মাসের পরিশোধ।
  // jer_payment (জেরের নগদ পরিশোধ) পুরনো বাকি মেটায় — চলতি দেনা-পাওনায় ধরা হয় না।
  const paymentsByMember = new Map<string, number>();
  const paymentsByName = new Map<string, number>();
  const fundByMember = new Map<string, number>();
  const fundByName = new Map<string, number>();
  const jerCashByMember = new Map<string, number>();
  const jerCashByName = new Map<string, number>();
  for (const d of deposits) {
    const v = toNumber(d.amount);
    const dtype = d.type || "permanent_fund";
    const isFund = dtype === "permanent_fund";
    const isJerCash = dtype === "jer_payment";
    const byMember = isFund ? fundByMember : isJerCash ? jerCashByMember : paymentsByMember;
    const byName = isFund ? fundByName : isJerCash ? jerCashByName : paymentsByName;
    if (d.memberId) byMember.set(d.memberId, (byMember.get(d.memberId) ?? 0) + v);
    const nm = (d.memberName || "").trim().toLowerCase();
    if (nm) byName.set(nm, (byName.get(nm) ?? 0) + v);
  }

  // নিজের পকেটের টাকা থেকে বাজার → সেই সদস্যের পাওনা (মাস শেষে সমন্বয়)
  const selfPaidByMember = new Map<string, number>();
  for (const r of bazar) {
    const who = String(r.paidByMemberId ?? "").trim();
    if (!who) continue;
    selfPaidByMember.set(who, round2((selfPaidByMember.get(who) ?? 0) + toNumber(r.amount)));
  }
  const totalSelfPaidBazar = round2([...selfPaidByMember.values()].reduce((s, v) => s + v, 0));
  const fundPaidBazar = round2(totalBazarCost - totalSelfPaidBazar);

  /* ── per member ─────────────────────────────────────────── */
  const memberCalculations: MemberCalculation[] = members.map((m) => {
    const nm = (m.name || "").trim().toLowerCase();
    const totalMemberMeals = round2(mealsByMember.get(m.id) ?? mealsByMemberName.get(nm) ?? 0);
    const mealCost = round2(totalMemberMeals * perMillRate);
    const individualExtra = round2(
      (individualByMember.get(m.id) ?? individualByMember.get(`name:${nm}`) ?? 0),
    );
    const sharedExtra = m.isActive !== false ? round2(sharedPerMember) : 0;

    // Rule 1/2 — total cost NEVER subtracts the permanent fund
    const totalCost = round2(mealCost + individualExtra + sharedExtra);

    const permanentFund = round2(fundByMember.get(m.id) ?? fundByName.get(nm) ?? 0);
    const totalDeposit = round2(paymentsByMember.get(m.id) ?? paymentsByName.get(nm) ?? 0);
    const selfPaidBazar = round2(selfPaidByMember.get(m.id) ?? 0);

    /* ── Rule 9 — জের (আগের মাসের বাকি) সমন্বয় ──────────────
     * 1. নিজের টাকার বাজার আগে জের মেটায় (jerAdjusted) —
     *    শুধু বাড়তি অংশই চলতি মাসের পাওনা (selfPaidCredit) হয়।
     * 2. তারপর নগদ জের-পরিশোধ (jer_payment) বাকি জের কমায়।
     * 3. যা বাকি থাকে (remainingJer) লাস্ট ব্যালেন্স থেকে বাদ যায় —
     *    তাই সমন্বয়কারী প্রতিটি বাজারে মূলধন আবার বাড়ে।
     * বাজার-মোট ও মিল রেটে এর কোনো প্রভাব নেই। */
    const applySettlement = input.applySettlement !== false;
    const openingDue = applySettlement ? Math.max(0, round2(toNumber((m as MemberDTO).openingDue))) : 0;
    const jerAdjusted = round2(Math.min(openingDue, selfPaidBazar));
    const jerCashTotal = round2(jerCashByMember.get(m.id) ?? jerCashByName.get(nm) ?? 0);
    const jerCashPaid = applySettlement ? round2(Math.min(Math.max(0, openingDue - jerAdjusted), Math.max(0, jerCashTotal))) : 0;
    const remainingJer = round2(openingDue - jerAdjusted - jerCashPaid);
    const selfPaidCredit = round2(selfPaidBazar - jerAdjusted);

    // দেনা-পাওনা = জমা/সমন্বয় + নিজ-টাকার বাজার + নগদে জের-পরিশোধ
    //            − চলতি মিল খরচ − গত মাসের জের (openingDue)
    // জের সমন্বয় (বাজার/নগদ) হলেই এই ঘরে জের কমতে থাকে; জের না থাকলে
    // পুরোনো সূত্রেই (জমা + নিজ-বাজার − খরচ) ফিরে যায়।
    const denaPoana = round2(totalDeposit + selfPaidBazar + jerCashPaid - totalCost - openingDue);
    const status: MemberCalculation["status"] =
      Math.abs(denaPoana) < 0.005 ? "সমান" : denaPoana < 0 ? "দিবে" : "পাবে";
    const statusEn: MemberCalculation["statusEn"] =
      Math.abs(denaPoana) < 0.005 ? "Settled" : denaPoana < 0 ? "Due" : "Receive";

    return {
      memberId: m.id,
      name: m.name,
      role: m.role || "member",
      phone: m.phone || "",
      isActive: m.isActive !== false,
      totalMill: totalMemberMeals,
      perMillRate,
      mealCost,
      individualExtra,
      sharedExtra,
      totalCost,
      totalDeposit,
      selfPaidBazar,
      openingDue,
      jerAdjusted,
      jerCashPaid,
      remainingJer,
      selfPaidCredit,
      permanentFund,
      denaPoana,
      balance: denaPoana,
      status,
      statusEn,
    };
  });

  /* ── Rule 9 totals ──────────────────────────────────────── */
  const totalOpeningDue = round2(memberCalculations.reduce((s, c) => s + c.openingDue, 0));
  const totalJerAdjusted = round2(memberCalculations.reduce((s, c) => s + c.jerAdjusted, 0));
  const totalJerCashPaid = round2(memberCalculations.reduce((s, c) => s + c.jerCashPaid, 0));
  const totalRemainingJer = round2(memberCalculations.reduce((s, c) => s + c.remainingJer, 0));

  /* ── last balance (spec §86) ─────────────────────────────
   *  লাস্ট ব্যালেন্স = হাতে থাকা প্রকৃত নগদ:
   *    গত মাসের নগদ ক্যারি + স্থায়ী ফান্ড + সব নগদ জমা (জের-পরিশোধসহ)
   *    − [ফান্ড থেকে করা বাজার + শেয়ার্ড + ব্যক্তিগত − অন্যান্য আয়]
   *  নিজের টাকার বাজার ফান্ড ছোঁয় না (fundPaidBazar থেকেই বাদ পড়ে),
   *  তাই ওই বাজার যে ফান্ড বাঁচায় তা নগদে থেকে যায়।
   *  বাকি জের নগদ থেকে বাদ হয় না — সদস্যের দেনা হিসেবে আলাদা দেখানো হয়
   *  (দেনা-পাওনা সারণি); নগদ জমা/জের-সমন্বয় এলেই নগদ ব্যালেন্স বাড়ে।
   */
  const operating = fundPaidBazar + totalSharedExtra + totalIndividualExtra - totalOthersIncome;
  const carry = toNumber(input.carryForwardBalance, 0);
  // প্রকৃত হাত-নগদ; ক্লোজের সময় পরের মাসে এটাই carryForwardBalance হিসেবে যায়।
  const cashBalance = round2(carry + totalFund + totalCashCollected - operating);
  // লাস্ট ব্যালেন্স (রিজার্ভ) = প্রকৃত নগদ − এখনো বাকি গত-মাসের জের।
  // নিজে বাজার/নগদে জের সমন্বয় হলে জের কমে ও ফান্ড-বাজার বাঁচে → LB বাড়ে;
  // এ মাসের বাজার-মোট, মিল রেট ও মিল খরচ স্বাভাবিকভাবেই ধরা থাকে।
  const lastBalance = round2(cashBalance - totalRemainingJer);

  return {
    totalMembers: members.length,
    activeMembers: activeCount,
    totalMill,
    totalBazarCost,
    totalOthersIncome,
    netCost,
    perMillRate,
    totalFund,
    totalSelfPaidBazar,
    totalOpeningDue,
    totalJerAdjusted,
    totalJerCashPaid,
    totalRemainingJer,
    fundPaidBazar,
    totalSharedExtra,
    totalIndividualExtra,
    totalDepositsThisMonth,
    totalMemberPayments,
    totalCashCollected,
    lastBalance,
    cashBalance,
    memberCalculations,
  };
}

/** meal matrix: day → memberId → meals (for the daily meal grid) */
export function buildMealMatrix(
  members: MemberDTO[],
  meals: MealRowDTO[],
  totalDays: number,
): Record<number, Record<string, number>> {
  const matrix: Record<number, Record<string, number>> = {};
  for (let d = 1; d <= totalDays; d++) matrix[d] = {};
  for (const m of members) {
    for (let d = 1; d <= totalDays; d++) matrix[d][m.id] = 0;
  }
  for (const r of meals) {
    if (!matrix[r.day]) matrix[r.day] = {};
    matrix[r.day][r.memberId] = toNumber(r.meals);
  }
  return matrix;
}

export function dayTotals(matrix: Record<number, Record<string, number>>, totalDays: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const row = matrix[d] ?? {};
    out.push(round2(Object.values(row).reduce((s, v) => s + toNumber(v), 0)));
  }
  return out;
}

/** bazar grouped by category (report + sheet summary) */
export function bazarByCategory(rows: BazarDTO[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = round2((out[r.category] ?? 0) + toNumber(r.amount));
  return out;
}

/** bazar grouped by buyer */
export function bazarByBuyer(rows: BazarDTO[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = r.buyerName || "—";
    out[k] = round2((out[k] ?? 0) + toNumber(r.amount));
  }
  return out;
}

export { round2, round4 };
