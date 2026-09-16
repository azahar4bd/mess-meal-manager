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
  const isCarry = (d: DepositDTO) => (d.createdBy ?? "") === "system:carry-forward";
  const fundRows = deposits.filter((d) => (d.type || "permanent_fund") === "permanent_fund");
  const totalFund = round2(fundRows.reduce((s, r) => s + toNumber(r.amount), 0));
  const totalDepositsThisMonth = round2(deposits.reduce((s, r) => s + toNumber(r.amount), 0));
  /**
   * সিস্টেম-ক্যারি-ফরোয়ার্ড সমন্বয় (নন-ফান্ড) — পুরনো মাসের চলতি বাকি/ফের বহন
   * করে, নগদ আনে না; নগদ গণনায় বাদ, কিন্তু দেনা-পাওনায় ধরা হয়।
   * (ফান্ড ক্যারি আলাদা — সেটা permanent_fund সারির ভেতরেই totalFund-এ থাকে।)
   */
  const totalCarryAdjust = round2(
    deposits
      .filter((d) => isCarry(d) && (d.type || "") !== "permanent_fund")
      .reduce((s, r) => s + toNumber(r.amount), 0),
  );
  /**
   * হাতে আসা প্রকৃত নগদ: ফান্ড (নতুন + ক্যারি হওয়া ফান্ড) ও নন-ফান্ড ক্যারি
   * সমন্বয় বাদে বাকি সব — সাধারণ জমা, মাস-শেষ পরিশোধ, জেরের নগদ পরিশোধ;
   * refund ঋণাত্মক চিহ্নে নগদ কমায়।
   */
  const totalCashCollected = round2(totalDepositsThisMonth - totalFund - totalCarryAdjust);
  /** ফান্ড ও জের-নগদ বাদে সাধারণ জমা/সমন্বয় (পুরোনো সামঞ্জস্য-সংখ্যা) */
  const totalJerCashAll = round2(
    deposits.filter((d) => (d.type || "") === "jer_payment").reduce((s, r) => s + toNumber(r.amount), 0),
  );
  const totalMemberPayments = round2(totalDepositsThisMonth - totalFund - totalJerCashAll - totalCarryAdjust);

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

  // সদস্যভিত্তিক জমা তিন ভাগে —
  //  • fundByMember: স্থায়ী তহবিল (নতুন + ক্লোজে ক্যারি হওয়া ফান্ড)
  //  • carryByMember: system:carry-forward নন-ফান্ড সমন্বয় (গত মাসের চলতি বাকি/ফের; নগদ নয়)
  //  • cashByMember: বাকি সব প্রকৃত নগদ (সাধারণ জমা, মাস-শেষ, জের-নগদ; refund ঋণাত্মক)
  const cashByMember = new Map<string, number>();
  const cashByName = new Map<string, number>();
  const fundByMember = new Map<string, number>();
  const fundByName = new Map<string, number>();
  const carryByMember = new Map<string, number>();
  const carryByName = new Map<string, number>();
  for (const d of deposits) {
    let v = toNumber(d.amount);
    const dtype = d.type || "permanent_fund";
    if (dtype === "refund") v = -Math.abs(v);
    let byMember: Map<string, number>;
    let byName: Map<string, number>;
    if (dtype === "permanent_fund") {
      byMember = fundByMember;
      byName = fundByName;
    } else if (isCarry(d)) {
      byMember = carryByMember;
      byName = carryByName;
    } else {
      byMember = cashByMember;
      byName = cashByName;
    }
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

  /* ── per member ───────────────────────────────────────────
   * জের-সমন্বয়ের ক্রম (waterfall):
   *   ১. নিজ টাকার বাজার আগে প্রারম্ভিক জের মেটায় → jerAdjusted;
   *      বাড়তি অংশই “নিজ টাকার বাজার” (selfPaidCredit) ঘরে বসে।
   *   ২. তারপর নগদ জমা বাকি জের মেটায় → jerCashPaid; বাড়তিটা চলতি
   *      মাসের জমা/সমন্বয় (cashCredit)।
   *   • মোট খরচ = মিল খরচ + ইন্ডি + শেয়ার্ড + প্রারম্ভিক বকেয়া জের
   *   • বকেয়া জের সমন্বয় = jerAdjusted + jerCashPaid
   *   • অবশিষ্ট বকেয়া জের = প্রারম্ভিক − সমন্বয়
   */
  const memberCalculations: MemberCalculation[] = members.map((m) => {
    const nm = (m.name || "").trim().toLowerCase();
    const totalMemberMeals = round2(mealsByMember.get(m.id) ?? mealsByMemberName.get(nm) ?? 0);
    const mealCost = round2(totalMemberMeals * perMillRate);
    const individualExtra = round2(
      (individualByMember.get(m.id) ?? individualByMember.get(`name:${nm}`) ?? 0),
    );
    const sharedExtra = m.isActive !== false ? round2(sharedPerMember) : 0;

    const applySettlement = input.applySettlement !== false;
    const openingDue = applySettlement ? Math.max(0, round2(toNumber((m as MemberDTO).openingDue))) : 0;

    // Rule 1/2 — মোট খরচে প্রারম্ভিক বকেয়া জের যোগ হয়; ফান্ড কখনো বাদ যায় না
    const currentCost = round2(mealCost + individualExtra + sharedExtra);
    const totalCost = round2(currentCost + openingDue);

    const permanentFund = round2(fundByMember.get(m.id) ?? fundByName.get(nm) ?? 0);
    const carryAdjust = round2(carryByMember.get(m.id) ?? carryByName.get(nm) ?? 0);
    const cashTotal = round2(cashByMember.get(m.id) ?? cashByName.get(nm) ?? 0);
    const selfPaidBazar = round2(selfPaidByMember.get(m.id) ?? 0);

    // ১) নিজ টাকার বাজার আগে জের মেটায়
    const jerAdjusted = round2(Math.min(openingDue, Math.max(0, selfPaidBazar)));
    const selfPaidCredit = round2(Math.max(0, selfPaidBazar) - jerAdjusted); // “নিজ টাকার বাজার” ঘর

    // ২) নগদ জমা বাকি জের মেটায় (দেনা-পাওনা জমা টেবিলের এন্ট্রিসহ যেকোনো নগদ)
    const jerCashPaid = applySettlement
      ? round2(Math.min(Math.max(0, openingDue - jerAdjusted), Math.max(0, cashTotal)))
      : 0;
    const cashCredit = round2(Math.max(0, cashTotal) - jerCashPaid);
    const remainingJer = round2(Math.max(0, openingDue - jerAdjusted - jerCashPaid));

    // চলতি মাসের জমা/সমন্বয় = জের-নগদ বাদে নগদ + গত মাসের বাকি/ফেরের ক্যারি-সমন্বয়
    const totalDeposit = round2(cashCredit + carryAdjust);
    // বকেয়া জের সমন্বয় (জমা-এন্ট্রি টাকা + নিজ টাকায় বাজার)
    const jerSettled = round2(jerAdjusted + jerCashPaid);

    // দেনা-পাওনা = −মোট খরচ + নিজ-বাজার ক্রেডিট + চলতি জমা + বকেয়া জের সমন্বয়
    const denaPoana = round2(selfPaidCredit + cashCredit + carryAdjust + jerSettled - totalCost);
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
      cashCredit,
      jerSettled,
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
  /** নিজ টাকার বাজার — জের মিটিয়ে যে বাড়তি অংশ জমা/সমন্বয়ে বসে (KPI) */
  const totalSelfPaidCredit = round2(memberCalculations.reduce((s, c) => s + c.selfPaidCredit, 0));

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
    totalSelfPaidCredit,
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
