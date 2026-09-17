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
      { id: "e1", monthId: "x", date: "2026-10-02", day: 2, title: "gas", amount: 120, type: "shared", memberId: null, memberName: "", paidByMemberId: "", note: "" },
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
  check("রহিমের মোট খরচ ১৫১০ (১০৫০ + ৬০ + প্রারম্ভিক জের ৪০০)", eq(rahim.totalCost, 1510), String(rahim.totalCost));
  check("জের থেকে সমন্বয় ১০০", eq(rahim.jerAdjusted, 100), String(rahim.jerAdjusted));
  check("বাকি জের ৩০০", eq(rahim.remainingJer, 300), String(rahim.remainingJer));
  check("পাওনা-ক্রেডিট ০ (পুরোটাই জেরে গেছে)", eq(rahim.selfPaidCredit, 0), String(rahim.selfPaidCredit));
  // দেনা = মিল খরচ ১১১০ + গত জের ৪০০ − জের সমন্বয় ১০০ = ১৪১০
  check("দেনা-পাওনা −১৪১০ (মিল খরচ + জের − সমন্বয়)", eq(rahim.denaPoana, -1410), String(rahim.denaPoana));
  check("মোট বাকি জের ৩০০", eq(s.totalRemainingJer, 300), String(s.totalRemainingJer));
  // প্রকৃত হাত-নগদ = ০ + ৩০০০ + ০ − (ফান্ড-বাজার ২০০০ + ১২০) = ৮৮০
  // লাস্ট ব্যালেন্স = (ফান্ড ৩০০০ − বাকি জের ৩০০ − নেট মিল খরচ ২১০০) + নিজ-বাজার ১০০ = ৭০০
  check("প্রকৃত হাত-নগদ (cashBalance) ৮৮০", eq(s.cashBalance, 880), String(s.cashBalance));
  check("লাস্ট ব্যালেন্স ৭০০ (ফান্ড ৩০০০ − জের ৩০০ − নেট ২১০০ + নিজ-বাজার ১০০)", eq(s.lastBalance, 700), String(s.lastBalance));
}

console.log("2) নিজের টাকার বাজারে জের সমন্বয় হলে লাস্ট ব্যালেন্স বাড়ে");
{
  // before: রহিমের ১০০ বাজার নেই (শুধু ফান্ড বাজার ২০০০); after: +১০০ নিজে বাজার
  const before = calculateMonth({ ...baseInput(), bazarExpenses: [bazar("b_fund", 2000)] });
  const after = calculateMonth(baseInput());
  // before: ফান্ড ৩০০০, জের ৪০০ অসমন্বিত, নেট ২০০০, নিজ-বাজার ০ → LB ৬০০
  check("বাজারের আগে লাস্ট ব্যালেন্স ৬০০", eq(before.lastBalance, 600), String(before.lastBalance));
  // after: জের ৩০০, নেট ২১০০, নিজ-বাজার ১০০ → ৩০০০−৩০০−২১০০+১০০ = ৭০০
  check("নিজের ১০০ বাজারে জের ১০০ মিটে LB ৭০০ (+১০০)", eq(after.lastBalance, 700), String(after.lastBalance));
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
  // (ফান্ড ৩০০০ − বাকি জের ০ − নেট ২৫০০) + নিজ-বাজার ৫০০ = ১০০০
  check("লাস্ট ব্যালেন্স ১০০০ (জের পুরো মিটে বাড়তি বাজার ফান্ড বাঁচিয়েছে)", eq(s.lastBalance, 1000), String(s.lastBalance));
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
  // হাত-নগদ = ৩০০০ + ১৫০ − ২১২০ = ১০৩০ (অপরিবর্তিত সূত্র)
  // LB = ৩০০০ − বাকি জের ১৫০ − নেট ২১০০ + নিজ-বাজার ১০০ = ৮৫০ (নগদে জের ১৫০ মিটে +১৫০)
  check("প্রকৃত হাত-নগদ ১০৩০", eq(s.cashBalance, 1030), String(s.cashBalance));
  check("লাস্ট ব্যালেন্স ৮৫০ (জের-নগদ ১৫০ মিটে test 1-এর ৭০০ থেকে +১৫০)", eq(s.lastBalance, 850), String(s.lastBalance));
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
  // সদস্যের চলতি মাসের নগদ জমা লাস্ট ব্যালেন্স (ফান্ড রিজার্ভ) বাড়ায় না —
  // সূত্রে শুধু ফান্ড, গত-জের, নেট মিল খরচ ও নিজ-বাজার; জমাটা দেনা-পাওনা মেটায়
  check("লাস্ট ব্যালেন্স ১০০০ (চলতি নগদ জমায় LB বদলায় না)", eq(s.lastBalance, 1000), String(s.lastBalance));
  // প্রকৃত হাত-নগদ বাড়ে: ৩০০০ + ৫০০ − ২১২০ = ১৩৮০
  check("প্রকৃত হাত-নগদ ১৩৮০ (নগদ জমা বক্সে আসে)", eq(s.cashBalance, 1380), String(s.cashBalance));
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
  // (ফান্ড ৩০০০ − জের ০ − নেট ২১০০) + নিজ-বাজার ১০০ = ১০০০
  check("লাস্ট ব্যালেন্স ১০০০ (ফান্ড − নেট মিল খরচ + নিজ-বাজার)", eq(s.lastBalance, 1000), String(s.lastBalance));
}

console.log("7) তারিখ-ফিল্টার ভিউতে জের প্রয়োগ হয় না");
{
  const s = calculateMonth({ ...baseInput(), fromDate: "2026-10-01", toDate: "2026-10-31", applySettlement: false });
  const rahim = s.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  check("openingDue ০ হিসেবে ধরে", rahim.openingDue === 0, String(rahim.openingDue));
  check("বাকি জের ০", rahim.remainingJer === 0, String(rahim.remainingJer));
  check("পুরনো সূত্রে দেনা-পাওনা −১০১০", eq(rahim.denaPoana, -1010), String(rahim.denaPoana));
}

console.log("8) ক্লোজ → নতুন মাস ক্যারি-চেইন (চূড়ান্ত দেনা = প্রারম্ভিক জের; ফান্ড কপি; পাওনা সমন্বয়)");
{
  const s1 = calculateMonth(baseInput());
  const rahim1 = s1.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  // M1: রহিম dena −১৪১০, করিম dena −১১১০; ফান্ড ৩০০০, প্রকৃত নগদ ৮৮০
  check("M1 রহিম দেনা −১৪১০", eq(rahim1.denaPoana, -1410), String(rahim1.denaPoana));
  check("M1 লাস্ট ব্যালেন্স ৭০০", eq(s1.lastBalance, 700), String(s1.lastBalance));

  // M2 (ক্লোজের পর অটো-খোলা): চূড়ান্ত দেনাই প্রারম্ভিক জের; ফান্ড সদস্যপ্রতি কপি;
  // নগদ ক্যারি = প্রকৃত নগদ ৮৮০ − ফান্ড ৩০০০ = −২১২০ (ফান্ড দুইবার গোনা হয় না)
  const m2: CalcInput = {
    members: [mem("mem_rahim", "Rahim", 1410), mem("mem_karim", "Karim", 1110)],
    dailyMeals: [],
    bazarExpenses: [],
    otherIncomes: [],
    deposits: [
      dep("cf1", "mem_rahim", "Rahim", 1500, "permanent_fund", "system:carry-forward"),
      dep("cf2", "mem_karim", "Karim", 1500, "permanent_fund", "system:carry-forward"),
    ],
    extraExpenses: [],
    carryForwardBalance: -2120,
  };
  const s2 = calculateMonth(m2);
  check("রহিমের M2 প্রারম্ভিক জের ১৪১০", eq(s2.memberCalculations[0]!.openingDue, 1410), String(s2.memberCalculations[0]!.openingDue));
  check("রহিম M2 দেনা −১৪১০ (অবিকৃত বাকি)", eq(s2.memberCalculations[0]!.denaPoana, -1410), String(s2.memberCalculations[0]!.denaPoana));
  check("করিম M2 দেনা −১১১০", eq(s2.memberCalculations[1]!.denaPoana, -1110), String(s2.memberCalculations[1]!.denaPoana));
  check("M2 ফান্ড ৩০০০ (কপি হয়েছে, কোনোভাবে ০ নয়)", eq(s2.totalFund, 3000), String(s2.totalFund));
  check("M2 প্রকৃত নগদ ৮৮০ (−২১২০ ক্যারি + ৩০০০ ফান্ড কপি)", eq(s2.cashBalance, 880), String(s2.cashBalance));
  // LB = ৩০০০ − বকেয়া জের ২৫২০ = ৪৮০
  check("নিষ্ক্রিয় M2-তে লাস্ট ব্যালেন্স ৪৮০ (ফান্ড − মোট বকেয়া)", eq(s2.lastBalance, 480), String(s2.lastBalance));

  // রহিম ৩০০ জের-নগদ + ১১১০ সাধারণ জমা দিয়ে পুরো বাকি ১৪১০ মেটাল
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
  // বাকি জের শুধু করিমের ১১১০ → LB = ৩০০০ − ১১১০ = ১৮৯০
  check("লাস্ট ব্যালেন্স ১৮৯০ (রহিমের ১৪১০ জের আদায়ে বেড়েছে)", eq(s2b.lastBalance, 1890), String(s2b.lastBalance));
}

console.log("9) নিজ টাকার বাজার ওয়াটারফল (জের আগে মেটে, বাড়তি ক্রেডিট)");
{
  // রহিম: বকেয়া ৫০০, নিজ টাকায় বাজার ১০০০ → ৫০০ জের সমন্বয় + ৫০০ ক্রেডিট
  // করিম: বকেয়া ৫০০, নিজ-বাজার ২০০ + নগদ ১০০০ → ২০০+৩০০ জের, ৭০০ নগদ ক্রেডিট
  const input: CalcInput = {
    members: [mem("mem_rahim", "Rahim", 500), mem("mem_karim", "Karim", 500)],
    dailyMeals: [],
    bazarExpenses: [
      bazar("b1", 1000, "mem_rahim", "Rahim"),
      bazar("b2", 200, "mem_karim", "Karim"),
    ],
    otherIncomes: [],
    deposits: [dep("dc", "mem_karim", "Karim", 1000, "member_deposit")],
    extraExpenses: [],
    carryForwardBalance: 0,
  };
  const s = calculateMonth(input);
  const rahim = s.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  const karim = s.memberCalculations.find((c) => c.memberId === "mem_karim")!;
  check("রহিম জের-সমন্বয় (নিজ-বাজার থেকে) ৫০০", eq(rahim.jerAdjusted, 500), String(rahim.jerAdjusted));
  check("রহিম নিজ-টাকা-বাজার ক্রেডিট ৫০০", eq(rahim.selfPaidCredit, 500), String(rahim.selfPaidCredit));
  check("রহিম অবশিষ্ট জের ০", eq(rahim.remainingJer, 0), String(rahim.remainingJer));
  check("রহিম মোট খরচ ৫০০ (কোনো মিল নেই, শুধু জের)", eq(rahim.totalCost, 500), String(rahim.totalCost));
  // ১০০০ নিজ-বাজার − ৫০০ জের-খরচ = ৫০০ পাবে
  check("রহিম দেনা-পাওনা +৫০০ (পাবে)", eq(rahim.denaPoana, 500), String(rahim.denaPoana));
  check("করিম নিজ-বাজারে জের ২০০", eq(karim.jerAdjusted, 200), String(karim.jerAdjusted));
  check("করিম নগদে জের ৩০০", eq(karim.jerCashPaid, 300), String(karim.jerCashPaid));
  check("করিম নগদ ক্রেডিট ৭০০", eq(karim.cashCredit, 700), String(karim.cashCredit));
  check("করিম অবশিষ্ট জের ০", eq(karim.remainingJer, 0), String(karim.remainingJer));
  // ২০০ নিজ-বাজার + ১০০০ নগদ − ৫০০ জের = +৭০০ পাবে
  check("করিম দেনা-পাওনা +৭০০ (পাবে)", eq(karim.denaPoana, 700), String(karim.denaPoana));
  check("KPI নিজ টাকার বাজার ৫০০ (রহিম; করিমের নিজ-বাজার পুরোটা জেরে)", eq(s.totalSelfPaidCredit, 500), String(s.totalSelfPaidCredit));
  // লাস্ট ব্যালেন্স = (ফান্ড ০ − জের ০ − নেট মিল ১২০০) + নিজ-বাজার ১২০০ = ০
  check("লাস্ট ব্যালেন্স ০ (সূত্র: ০ − ০ − ১২০০ + ১২০০)", eq(s.lastBalance, 0), String(s.lastBalance));
  // প্রকৃত হাত-নগদ: বাজার ১২০০ পুরোটা নিজ পকেটে (ফান্ড থেকে ০), হাতে আসা নগদ ১০০০
  check("প্রকৃত নগদ ১০০০ (ফান্ড-বাজার ০, নগদ আদায় ১০০০)", eq(s.cashBalance, 1000), String(s.cashBalance));
}

console.log("10) ক্যারি-ফরোয়ার্ড স্থায়ী ফান্ড ডিপোজিট হিসাবে দ্বিগুণ গণনা হয় না");
{
  // নতুন মাসে সদস্যভিত্তিক ফান্ড permanent_fund ক্যারি-রো হিসেবে আসে
  const input: CalcInput = {
    ...baseInput(),
    deposits: [
      dep("cf1", "mem_rahim", "Rahim", 2000, "permanent_fund", "system:carry-forward"),
      dep("cf2", "mem_karim", "Karim", 2000, "permanent_fund", "system:carry-forward"),
    ],
  };
  const s = calculateMonth(input);
  check("ক্যারি ফান্ড মোট ফান্ডে ৪০০০", eq(s.totalFund, 4000), String(s.totalFund));
  check("ক্যারি ফান্ড নগদ সংগ্রহে ০", eq(s.totalCashCollected, 0), String(s.totalCashCollected));
  // ৪০০০ ফান্ড হাতেই থাকে; নগদ সংগ্রহ ০ → ৪০০০ − ফান্ড-বাজার ২০০০ − শেয়ার্ড ১২০ = ১৮৮০
  check("ক্যারি ফান্ড নগদ ব্যালেন্সে একবারই গোনে (১৮৮০)", eq(s.cashBalance, 1880), String(s.cashBalance));
  // LB = (৪০০০ − বাকি জের ৩০০ − নেট ২১০০) + নিজ-বাজার ১০০ = ১৭০০
  check("লাস্ট ব্যালেন্স ১৭০০ (ফান্ড ক্যারি সূত্রেও একবারই গোনা)", eq(s.lastBalance, 1700), String(s.lastBalance));
  check("ক্যারি ফান্ড কোনো সদস্যকে ক্রেডিট দেয় না (রহিম −১৪১০)", eq(s.memberCalculations[0]!.denaPoana, -1410), String(s.memberCalculations[0]!.denaPoana));
}

console.log("11) ফান্ড কখনো ০ হয় না: ক্যারি ফান্ড + নতুন ফান্ড cumulative");
{
  const input: CalcInput = {
    members: [mem("mem_rahim", "Rahim"), mem("mem_karim", "Karim")],
    dailyMeals: [],
    bazarExpenses: [],
    otherIncomes: [],
    deposits: [
      dep("cf1", "mem_rahim", "Rahim", 1500, "permanent_fund", "system:carry-forward"),
      dep("cf2", "mem_karim", "Karim", 1500, "permanent_fund", "system:carry-forward"),
      dep("new1", "mem_rahim", "Rahim", 500, "permanent_fund"),
    ],
    extraExpenses: [],
    carryForwardBalance: 0,
  };
  const s = calculateMonth(input);
  const rahim = s.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  const karim = s.memberCalculations.find((c) => c.memberId === "mem_karim")!;
  check("রহিমের cumulative ফান্ড ২০০০", eq(rahim.permanentFund, 2000), String(rahim.permanentFund));
  check("করিমের cumulative ফান্ড ১৫০০", eq(karim.permanentFund, 1500), String(karim.permanentFund));
  check("মোট ফান্ড ৩৫০০", eq(s.totalFund, 3500), String(s.totalFund));
  check("LB = ফান্ড ৩৫০০ (কোনো খরচ/জের নেই)", eq(s.lastBalance, 3500), String(s.lastBalance));
}

console.log("12) ক্লোজে পাওনা (+dena) পরের মাসে ধনাত্মক সমন্বয় হিসেবে আসে");
{
  // test 9-এর পরের মাস: রহিম পাবে ৫০০, করিম পাবে ৭০০; ফান্ড ০, কোনো এন্ট্রি নেই
  const input: CalcInput = {
    members: [mem("mem_rahim", "Rahim"), mem("mem_karim", "Karim")],
    dailyMeals: [],
    bazarExpenses: [],
    otherIncomes: [],
    deposits: [
      dep("car_r", "mem_rahim", "Rahim", 500, "adjustment", "system:carry-forward"),
      dep("car_k", "mem_karim", "Karim", 700, "adjustment", "system:carry-forward"),
    ],
    extraExpenses: [],
    carryForwardBalance: 1000, // test 9-এর প্রকৃত নগদ
  };
  const s = calculateMonth(input);
  check("রহিম দেনা-পাওনা +৫০০", eq(s.memberCalculations[0]!.denaPoana, 500), String(s.memberCalculations[0]!.denaPoana));
  check("করিম দেনা-পাওনা +৭০০", eq(s.memberCalculations[1]!.denaPoana, 700), String(s.memberCalculations[1]!.denaPoana));
  check("সমন্বয় নগদ ব্যালেন্সে দ্বিগুণ হয় না (১০০০)", eq(s.cashBalance, 1000), String(s.cashBalance));
  check("কোনো জের নেই → LB ০ (ফান্ড নেই)", eq(s.lastBalance, 0), String(s.lastBalance));
}

console.log("13) অতিরিক্ত খরচ নিজ টাকায় দিলে নিজ-বাজার ঘরে জমা, ফান্ড ছোঁয় না");
{
  const input: CalcInput = {
    members: [mem("mem_rahim", "Rahim"), mem("mem_karim", "Karim")],
    dailyMeals: [],
    bazarExpenses: [],
    otherIncomes: [],
    deposits: [
      dep("d1", "mem_rahim", "Rahim", 1500, "permanent_fund"),
      dep("d2", "mem_karim", "Karim", 1500, "permanent_fund"),
    ],
    extraExpenses: [
      { id: "e1", monthId: "x", date: "2026-10-02", day: 2, title: "gas", amount: 120, type: "shared", memberId: null, memberName: "", paidByMemberId: "mem_rahim", note: "" },
    ],
    carryForwardBalance: 0,
  };
  const s = calculateMonth(input);
  const rahim = s.memberCalculations.find((c) => c.memberId === "mem_rahim")!;
  const karim = s.memberCalculations.find((c) => c.memberId === "mem_karim")!;
  // শেয়ার্ড ১২০ → জনপ্রতি ৬০; রহিম নিজ টাকায় দিয়েছে → ১২০ ক্রেডিট
  check("জনপ্রতি ৬০ চার্জ", Boolean(eq(rahim.sharedExtra, 60) && eq(karim.sharedExtra, 60)));
  check("রহিমের নিজ টাকার বাজার ক্রেডিট ১২০", eq(rahim.selfPaidCredit, 120), String(rahim.selfPaidCredit));
  check("রহিম পাবে ৬০ (১২০ − তার ভাগ ৬০)", eq(rahim.denaPoana, 60), String(rahim.denaPoana));
  check("করিম দেবে ৬০", eq(karim.denaPoana, -60), String(karim.denaPoana));
  check("KPI নিজ টাকার বাজারে ১২০ দেখায়", eq(s.totalSelfPaidCredit, 120), String(s.totalSelfPaidCredit));
  check("ফান্ড নগদ ৩০০০ অক্ষত (গ্যাসের টাকা ফান্ড থেকে যায়নি)", eq(s.cashBalance, 3000), String(s.cashBalance));
  check("লাস্ট ব্যালেন্স ৩০০০ অপরিবর্তিত (নিজ টাকার এক্সট্রা LB বদলায় না)", eq(s.lastBalance, 3000), String(s.lastBalance));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
