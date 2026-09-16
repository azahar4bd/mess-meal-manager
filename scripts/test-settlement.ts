/**
 * জের (আগের মাসের বাকি) সমন্বয় লজিকের পিওর-ইউনিট টেস্ট — ডাটাবেস/সার্ভার লাগে না।
 *
 * যাচাই করে (Rule 9):
 *  ১. নিজের টাকার বাজার আগে জের মেটায়, বাড়তিটাই পাওনা হয়
 *  ২. বাকি জের লাস্ট ব্যালেন্স থেকে বাদ থাকে; সমন্বয়কারী বাজারে মূলধন বাড়ে
 *  ৩. বাজার-মোট ও মিল রেটে জেরের কোনো প্রভাব নেই
 *  ৪. jer_payment নগদে জের কমায় এবং দেনা-পাওনা ঘরেও স্বচ্ছভাবে ধরা পড়ে
 *  ৫. closing_payment দেনা-পাওনা কমায় এবং লাস্ট ব্যালেন্স (নগদ) বাড়ায়
 *  ৬. জের না থাকলে পুরনো সূত্র হুবহু একই থাকে; ফিল্টার-ভিউতে জের প্রয়োগ হয় না
 *
 * চালানোর নিয়ম:  npm run test:settlement
 */
import { calculateMonth, type CalcInput } from "../src/lib/calc";
import type { BazarDTO, DepositDTO, MemberDTO } from "../src/lib/types";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;

const mem = (id: string, name: string, openingDue = 0): MemberDTO => ({
  id,
  officeId: "office_test",
  monthId: "office_test-2026-10",
  name,
  role: "member",
  isActive: true,
  phone: "",
  note: "",
  sortOrder: 0,
  openingDue,
  createdAt: new Date().toISOString(),
});

const bazar = (id: string, amount: number, paidByMemberId = "", buyerName = "Manager"): BazarDTO => ({
  id,
  monthId: "office_test-2026-10",
  date: "2026-10-01",
  day: 1,
  memberId: null,
  buyerName,
  paidByMemberId,
  category: "Groceries",
  items: "test",
  lines: [],
  amount,
  note: "",
});

const dep = (id: string, memberId: string, memberName: string, amount: number, type: string, createdBy = ""): DepositDTO => ({
  id,
  monthId: "office_test-2026-10",
  date: "2026-10-01",
  day: 1,
  memberId,
  memberName,
  amount,
  note: "",
  type,
  createdBy,
});

/** ব্যবহারকারীর উদাহরণ: রহিমের ৪০০ জের, ১ম দিনে নিজের টাকায় ১০০ বাজার */
function baseInput(): CalcInput {
  return {
    members: [mem("mem_rahim", "Rahim", 400), mem("mem_karim", "Karim")],
    dailyMeals: [
      { id: "m1", monthId: "x", memberId: "mem_rahim", memberName: "Rahim", day: 1, date: "2026-10-01", meals: 30, note: "" },
      { id: "m2", monthId: "x", memberId: "mem_karim", memberName: "Karim", day: 1, date: "2026-10-01", meals: 30, note: "" },
    ],
    bazarExpenses: [
      bazar("b_fund", 2000), // ফান্ডের বাজার
      bazar("b_self", 100, "mem_rahim", "Rahim"), // রহিমের নিজের টাকার বাজার
    ],
    otherIncomes: [],
    deposits: [
      dep("d1", "mem_rahim", "Rahim", 1500, "permanent_fund"),
      dep("d2", "mem_karim", "Karim", 1500, "permanent_fund"),
    ],
    extraExpenses: [
      { id: "e1", monthId: "x", date: "2026-10-02", day: 2, title: "gas", amount: 120, type: "shared", memberId: null, memberName: "", note: "" },
    ],
    carryForwardBalance: 0,
  };
}

console.log("1) জের সমন্বয়ের মূল দৃশ্য (৪০০ জের → ১০০ বাজার)");
{
  const s = calculateMonth(baseInput());
  const rahim = s.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  check("মোট বাজার ২১০০ (নিজের বাজারসহ)", eq(s.totalBazarCost, 2100), String(s.totalBazarCost));
  check("মিল রেট ৩৫ (২১০০ ÷ ৬০)", eq(s.perMillRate, 35), String(s.perMillRate));
  check("রহিমের মোট খরচ ১১১০ (১০৫০ + ৬০)", eq(rahim.totalCost, 1110), String(rahim.totalCost));
  check("জের থেকে সমন্বয় ১০০", eq(rahim.jerAdjusted, 100), String(rahim.jerAdjusted));
  check("বাকি জের ৩০০", eq(rahim.remainingJer, 300), String(rahim.remainingJer));
  check("পাওনা-ক্রেডিট ০ (পুরোটাই জেরে গেছে)", eq(rahim.selfPaidCredit, 0), String(rahim.selfPaidCredit));
  // দেনা = মিল খরচ ১১১০ + গত জের ৪০০ − জের সমন্বয় ১০০ = ১৪১০
  check("দেনা-পাওনা −১৪১০ (মিল খরচ + জের − সমন্বয়)", eq(rahim.denaPoana, -1410), String(rahim.denaPoana));
  check("মোট বাকি জের ৩০০", eq(s.totalRemainingJer, 300), String(s.totalRemainingJer));
  // প্রকৃত হাত-নগদ = ০ + ৩০০০ + ০ − (ফান্ড-বাজার ২০০০ + ১২০) = ৮৮০
  // লাস্ট ব্যালেন্স = নগদ ৮৮০ − বাকি জের ৩০০ = ৫৮০
  check("প্রকৃত হাত-নগদ (cashBalance) ৮৮০", eq(s.cashBalance, 880), String(s.cashBalance));
  check("লাস্ট ব্যালেন্স ৫৮০ (নগদ ৮৮০ − বাকি জের ৩০০)", eq(s.lastBalance, 580), String(s.lastBalance));
}

console.log("2) নিজের টাকার বাজারে জের সমন্বয় হলে লাস্ট ব্যালেন্স বাড়ে");
{
  // before: রহিমের ১০০ বাজার নেই (শুধু ফান্ড বাজার ২০০০); after: +১০০ নিজে বাজার
  const before = calculateMonth({ ...baseInput(), bazarExpenses: [bazar("b_fund", 2000)] });
  const after = calculateMonth(baseInput());
  // before: নগদ ৮৮০, জের ৪০০ অসমন্বিত → LB ৪৮০
  check("বাজারের আগে লাস্ট ব্যালেন্স ৪৮০", eq(before.lastBalance, 480), String(before.lastBalance));
  // after: নগদ ৮৮০ (ফান্ড-বাজার একই ২০০০), জের ৩০০ → LB ৫৮০; বাজার-মোট ও রেট স্বাভাবিক
  check("নিজের ১০০ বাজারে জের ১০০ মিটে LB ৫৮০ (+১০০)", eq(after.lastBalance, 580), String(after.lastBalance));
  check("লাস্ট ব্যালেন্স ১০০ বেড়েছে", eq(after.lastBalance - before.lastBalance, 100));
  check("বাজার-মোট ২১০০ (এ মাসের খরচ ঠিক আছে)", eq(after.totalBazarCost, 2100), String(after.totalBazarCost));
  check("after-এ বাকি জের ৩০০", eq(after.totalRemainingJer, 300), String(after.totalRemainingJer));
}

console.log("3) জের পুরো মিটে গেলে বাড়তি বাজার পাওনা হয়");
{
  const input = baseInput();
  input.bazarExpenses = [...input.bazarExpenses, bazar("b_self2", 400, "mem_rahim", "Rahim")];
  const s = calculateMonth(input);
  const rahim = s.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  check("জের সমন্বয় ৪০০ (পুরো জের)", eq(rahim.jerAdjusted, 400), String(rahim.jerAdjusted));
  check("বাকি জের ০", eq(rahim.remainingJer, 0), String(rahim.remainingJer));
  check("পাওনা-ক্রেডিট ১০০ (৫০০ − ৪০০)", eq(rahim.selfPaidCredit, 100), String(rahim.selfPaidCredit));
  // বাড়তি বাজারে রেট বেড়ে খরচ ১৩১০.১ → দেনা-পাওনা = ১০০ − ১৩১০.১ (বাজার রেটে আগের মতোই ধরে)
  check("দেনা-পাওনা −১২১০.১ (ক্রেডিট যোগ হয়েছে)", eq(rahim.denaPoana, -1210.1), String(rahim.denaPoana));
  // বাজার-মোট ২৫০০, রেট বদলায় — কিন্তু জের-লজিকের জন্য নয়, বাজার বাড়ার জন্য
  check("মিল রেট = ২৫০০ ÷ ৬০", eq(s.perMillRate, 2500 / 60), String(s.perMillRate));
  check("লাস্ট ব্যালেন্স ৮৮০ (৩০০০ − ২১২০ − ০)", eq(s.lastBalance, 880), String(s.lastBalance));
}

console.log("4) নগদ জের-পরিশোধ (jer_payment)");
{
  const input = baseInput();
  input.deposits = [...input.deposits, dep("d_jer", "mem_rahim", "Rahim", 150, "jer_payment")];
  const s = calculateMonth(input);
  const rahim = s.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  check("নগদে জের মিটেছে ১৫০", eq(rahim.jerCashPaid, 150), String(rahim.jerCashPaid));
  check("বাকি জের ১৫০ (৪০০ − ১০০ − ১৫০)", eq(rahim.remainingJer, 150), String(rahim.remainingJer));
  check("জের-নগদ সাধারণ জমা কলামে নয় (totalDeposit ০)", eq(rahim.totalDeposit, 0), String(rahim.totalDeposit));
  // দায় ১৫১০ (১১১০ + ৪০০), দিয়েছে ১০০ (বাজার) + ১৫০ (নগদ) → বাকি ১২৬০
  check("দেনা-পাওনা −১২৬০ (নগদ পরিশোধ দেনা কমায়)", eq(rahim.denaPoana, -1260), String(rahim.denaPoana));
  check("সদস্য-পেমেন্ট মোটে jer_payment বাদ (০)", eq(s.totalMemberPayments, 0), String(s.totalMemberPayments));
  // হাত-নগদ = ৩০০০ + ১৫০ − ২১২০ = ১০৩০; বাকি জের ১৫০ → LB = ১০৩০ − ১৫০ = ৮৮০
  check("প্রকৃত হাত-নগদ ১০৩০", eq(s.cashBalance, 1030), String(s.cashBalance));
  check("লাস্ট ব্যালেন্স ৮৮০ (নগদ ১০৩০ − বাকি জের ১৫০)", eq(s.lastBalance, 880), String(s.lastBalance));
}

console.log("5) মাস-শেষ পরিশোধ (closing_payment) সাধারণ জমার মতোই ধরে");
{
  const input = baseInput();
  input.members = [mem("mem_rahim", "Rahim"), mem("mem_karim", "Karim")];
  input.deposits = [...input.deposits, dep("d_close", "mem_rahim", "Rahim", 500, "closing_payment")];
  const s = calculateMonth(input);
  const rahim = s.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  check("জমায় ৫০০ যোগ হয়েছে", eq(rahim.totalDeposit, 500), String(rahim.totalDeposit));
  // জের নেই: ৫০০ + নিজ-বাজার ১০০ − খরচ ১১১০ = −৫১০
  check("দেনা-পাওনা −৫১০ (৫০০ + ১০০ − ১১১০)", eq(rahim.denaPoana, -510), String(rahim.denaPoana));
  // জমা নগদ বলে লাস্ট ব্যালেন্স ৮৮০ → ১৩৮০ বাড়ে; বাজার/মিল রেট অপরিবর্তিত
  check("জমায় লাস্ট ব্যালেন্স ৫০০ বাড়ে (১৩৮০)", eq(s.lastBalance, 1380), String(s.lastBalance));
  check("মিল রেট অপরিবর্তিত ৩৫", eq(s.perMillRate, 35), String(s.perMillRate));
}

console.log("6) জের না থাকলে পুরনো সূত্র হুবহু একই");
{
  const input = baseInput();
  input.members = [mem("mem_rahim", "Rahim", 0), mem("mem_karim", "Karim", 0)];
  const s = calculateMonth(input);
  const rahim = s.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  check("জের-ফিল্ড সব শূন্য", rahim.openingDue === 0 && rahim.remainingJer === 0 && s.totalRemainingJer === 0);
  check("পুরো ১০০-ই পাওনা-ক্রেডিট", eq(rahim.selfPaidCredit, 100), String(rahim.selfPaidCredit));
  check("দেনা-পাওনা = জমা + নিজের বাজার − খরচ", eq(rahim.denaPoana, rahim.totalDeposit + rahim.selfPaidBazar - rahim.totalCost));
  check("লাস্ট ব্যালেন্স = ফান্ড − খরচ (৮৮০)", eq(s.lastBalance, 880), String(s.lastBalance));
}

console.log("7) তারিখ-ফিল্টার ভিউতে জের প্রয়োগ হয় না");
{
  const s = calculateMonth({ ...baseInput(), fromDate: "2026-10-01", toDate: "2026-10-31", applySettlement: false });
  const rahim = s.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  check("openingDue ০ হিসেবে ধরে", rahim.openingDue === 0, String(rahim.openingDue));
  check("বাকি জের ০", rahim.remainingJer === 0, String(rahim.remainingJer));
  check("পুরনো সূত্রে দেনা-পাওনা −১০১০", eq(rahim.denaPoana, -1010), String(rahim.denaPoana));
}

console.log("8) ক্লোজ → নতুন মাস ক্যারি-চেইন (জের আলাদা, চলতি বাকি অটো ফের-এন্ট্রি)");
{
  const s1 = calculateMonth(baseInput());
  const rahim1 = s1.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  // M1: রহিম dena −১৪১০, বাকি-জের ৩০০; করিম dena −১১১০, জের ০
  check("M1 রহিম বাকি-জের ৩০০", eq(rahim1.remainingJer, 300), String(rahim1.remainingJer));
  check("M1 লাস্ট ব্যালেন্স ৫৮০", eq(s1.lastBalance, 580), String(s1.lastBalance));

  // M2: শুধু বাকি-জের openingDue; চলতি বাকি system:carry-forward adjustment
  const m2: CalcInput = {
    members: [mem("mem_rahim", "Rahim", 300), mem("mem_karim", "Karim", 0)],
    dailyMeals: [],
    bazarExpenses: [],
    otherIncomes: [],
    deposits: [
      // currentPart = denaPoana + remainingJer
      dep("car_r", "mem_rahim", "Rahim", -1110, "adjustment", "system:carry-forward"),
      dep("car_k", "mem_karim", "Karim", -1110, "adjustment", "system:carry-forward"),
    ],
    extraExpenses: [],
    carryForwardBalance: s1.cashBalance, // প্রকৃত নগদ ৮৮০
  };
  const s2 = calculateMonth(m2);
  check("রহিমের M2 প্রারম্ভিক জের ৩০০", eq(s2.memberCalculations[0]!.openingDue, 300), String(s2.memberCalculations[0]!.openingDue));
  check("রহিম M2 দেনা −১৪১০ (অবিকৃত বাকি)", eq(s2.memberCalculations[0]!.denaPoana, -1410), String(s2.memberCalculations[0]!.denaPoana));
  check("করিম M2 দেনা −১১১০", eq(s2.memberCalculations[1]!.denaPoana, -1110), String(s2.memberCalculations[1]!.denaPoana));
  // নগদ ৮৮০ − বাকি জের ৩০০ = ৫৮০ = M1 লাস্ট ব্যালেন্স — চেইন স্থিতিশীল
  check("নিষ্ক্রিয় M2-তে লাস্ট ব্যালেন্স ৫৮০ (M1-এর সমান)", eq(s2.lastBalance, 580), String(s2.lastBalance));
  check("M2 প্রকৃত নগদ ৮৮০", eq(s2.cashBalance, 880), String(s2.cashBalance));

  // রহিম ৩০০ জের-নগদ + ১১১০ সাধারণ জমা দিয়ে পুরো বাকি মেটাল
  const m2b: CalcInput = {
    ...m2,
    deposits: [
      ...m2.deposits!,
      dep("dj", "mem_rahim", "Rahim", 300, "jer_payment"),
      dep("dc", "mem_rahim", "Rahim", 1110, "member_deposit"),
    ],
  };
  const s2b = calculateMonth(m2b);
  const rahim2 = s2b.memberCalculations[0]!;
  check("রহিম বাকি-জের ০", eq(rahim2.remainingJer, 0), String(rahim2.remainingJer));
  check("রহিম দেনা-পাওনা ০", eq(rahim2.denaPoana, 0), String(rahim2.denaPoana));
  check("নগদ ২২৯০ (৮৮০ + ৩০০ + ১১১০)", eq(s2b.cashBalance, 2290), String(s2b.cashBalance));
  check("লাস্ট ব্যালেন্স ২২৯০ (বাকি জের নেই)", eq(s2b.lastBalance, 2290), String(s2b.lastBalance));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
