/**
 * Seed / initial setup (spec §110–§111).
 *
 * Creates:
 *   • a platform admin            (01700000000 / admin)         — CHANGE IN PRODUCTION
 *   • demo office "Gobra"         (GOBRA01) with manager + members + full month data
 *   • demo office "Barishal"      (BARISHAL01) with an audit user and a previous month
 *
 * Run:  npm run db:seed        (idempotent — safe to run repeatedly)
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  bazarExpenses,
  dailyMeals,
  deposits,
  extraExpenses,
  members as membersTable,
  messMonths,
  offices,
  otherIncomes,
  users,
  cryptoId,
  type BazarCategory,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { dhakaNow, isoOfDay, monthLabel } from "../src/lib/date";
import {
  createOffice,
  ensureMonth,
  getOffice,
  listMembers,
} from "../src/lib/mess-data";
import { createUser } from "../src/lib/service";

const ADMIN_USER_ID = process.env.SEED_ADMIN_USER_ID ?? "01700000000";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Platform Admin";

/* deterministic pseudo random so the demo numbers are stable */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

async function seedAdmin() {
  const existing = await db.select().from(users).where(eq(users.userId, ADMIN_USER_ID)).limit(1);
  if (existing[0]) {
    console.log(`  ✓ platform admin already exists (${ADMIN_USER_ID})`);
    return existing[0];
  }
  const admin = await createUser({
    userId: ADMIN_USER_ID,
    name: ADMIN_NAME,
    email: "admin@mess.local",
    phone: ADMIN_USER_ID,
    officeId: null,
    role: "admin",
    status: "active",
    password: ADMIN_PASSWORD,
  });
  console.log(`  + platform admin created: ${ADMIN_USER_ID} / ${ADMIN_PASSWORD}`);
  return admin;
}

interface OfficeSeed {
  id: string;
  name: string;
  branch: string;
  code: string;
  manager: { userId: string; name: string; phone: string; email: string; password: string };
  audit?: { userId: string; name: string; phone: string; password: string };
  memberList: { name: string; phone: string; fund: number }[];
  pendingMember?: { userId: string; name: string; phone: string; password: string };
  randomSeed: number;
}

const OFFICES: OfficeSeed[] = [
  {
    id: "office_gobra",
    name: "Gobra Mess",
    branch: "Barishal",
    code: "GOBRA01",
    manager: {
      userId: "01711111111",
      name: "Azahar Hossain",
      phone: "01711111111",
      email: "manager@gobra.mess",
      password: "manager123",
    },
    audit: { userId: "01733333333", name: "Audit Rahman", phone: "01733333333", password: "audit123" },
    pendingMember: { userId: "01799999999", name: "New Joiner Shakil", phone: "01799999999", password: "member123" },
    memberList: [
      { name: "Azahar Hossain", phone: "01711111111", fund: 3000 },
      { name: "Rahim Uddin", phone: "01722222222", fund: 2000 },
      { name: "Karim Mia", phone: "01744444444", fund: 2500 },
      { name: "Selim Ahmed", phone: "01755555555", fund: 1500 },
      { name: "Jashim Khan", phone: "01766666666", fund: 2000 },
      { name: "Belal Howlader", phone: "01777777777", fund: 1000 },
    ],
    randomSeed: 20260911,
  },
  {
    id: "office_barishal",
    name: "Barishal Head Office Mess",
    branch: "Barishal Sadar",
    code: "BARISHAL01",
    manager: {
      userId: "01811111111",
      name: "Mahmudul Hasan",
      phone: "01811111111",
      email: "manager@barishal.mess",
      password: "manager123",
    },
    memberList: [
      { name: "Mahmudul Hasan", phone: "01811111111", fund: 5000 },
      { name: "Nurul Islam", phone: "01822222222", fund: 3000 },
      { name: "Sohel Rana", phone: "01833333333", fund: 3000 },
      { name: "Imran Kabir", phone: "01844444444", fund: 2500 },
    ],
    randomSeed: 77123,
  },
  {
    id: "office_dhaka",
    name: "Dhaka Branch Mess",
    branch: "Motijheel, Dhaka",
    code: "DHAKA01",
    manager: {
      userId: "01911111111",
      name: "Farhana Akter",
      phone: "01911111111",
      email: "manager@dhaka.mess",
      password: "manager123",
    },
    memberList: [
      { name: "Farhana Akter", phone: "01911111111", fund: 4000 },
      { name: "Tanvir Alam", phone: "01922222222", fund: 2000 },
      { name: "Ripon Das", phone: "01933333333", fund: 2000 },
    ],
    randomSeed: 5150,
  },
];

const BAZAR_ITEMS: { category: BazarCategory; items: string; min: number; max: number }[] = [
  { category: "Rice", items: "মিনিকেট চাল ৫ কেজি", min: 1600, max: 2200 },
  { category: "Vegetables", items: "Potato, Onion, Tomato", min: 300, max: 700 },
  { category: "Meat", items: "Beef 2kg", min: 1200, max: 1800 },
  { category: "Fish", items: "Rui fish 2kg", min: 700, max: 1200 },
  { category: "Groceries", items: "Dal, Salt, Sugar, Soap", min: 400, max: 900 },
  { category: "Oil", items: "Soybean oil 2L", min: 600, max: 850 },
  { category: "Spices", items: "Holud, Morich, Jeera", min: 200, max: 450 },
  { category: "Vegetables", items: "Seasonal vegetables", min: 250, max: 600 },
];

async function seedOffice(spec: OfficeSeed, year: number, month: number, prevYear: number, prevMonth: number) {
  console.log(`\n▶ Office: ${spec.name} (${spec.code})`);

  /* ── office ─────────────────────────────────────────── */
  let office = await getOffice(spec.id);
  if (!office) {
    office = await createOffice({
      id: spec.id,
      code: spec.code,
      name: spec.name,
      branch: spec.branch,
      managerName: spec.manager.name,
      managerEmail: spec.manager.email,
      managerPhone: spec.manager.phone,
      status: "active",
      isDefault: spec.id === "office_gobra",
    });
    console.log(`  + office created (${office.id})`);
  } else {
    console.log(`  ✓ office exists (${office.id})`);
  }

  /* ── users ──────────────────────────────────────────── */
  const ensureUser = async (
    userId: string,
    name: string,
    phone: string,
    email: string,
    password: string,
    role: "manager" | "member" | "audit",
    status: "active" | "pending" | "approved",
  ) => {
    const existing = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
    if (existing[0]) return existing[0];
    const created = await createUser({
      userId,
      name,
      phone,
      email,
      branch: spec.branch,
      officeId: office!.id,
      role,
      status,
      password,
    });
    console.log(`  + user ${role}: ${userId} / ${password}`);
    return created;
  };

  await ensureUser(spec.manager.userId, spec.manager.name, spec.manager.phone, spec.manager.email, spec.manager.password, "manager", "active");
  if (spec.audit) await ensureUser(spec.audit.userId, spec.audit.name, spec.audit.phone, "", spec.audit.password, "audit", "active");
  if (spec.pendingMember)
    await ensureUser(spec.pendingMember.userId, spec.pendingMember.name, spec.pendingMember.phone, "", spec.pendingMember.password, "member", "pending");

  /* ── demo member login (approved) ───────────────────── */
  if (spec.memberList[1]) {
    await ensureUser(spec.memberList[1].phone, spec.memberList[1].name, spec.memberList[1].phone, "", "member123", "member", "approved");
  }

  /* ── previous month (proves month isolation, spec §20) ─ */
  const prev = await ensureMonth(office.id, prevYear, prevMonth);
  const current = await ensureMonth(office.id, year, month);
  console.log(`  ✓ months: ${prev.id} (previous), ${current.id} (current)`);

  await seedMonthRoster(office.id, prev, spec, prevYear, prevMonth, true);
  await seedMonthRoster(office.id, current, spec, year, month, false);
}

async function seedMonthRoster(
  officeId: string,
  month: { id: string; year: number; month: number; totalDays: number },
  spec: OfficeSeed,
  year: number,
  monthNum: number,
  isPrevious: boolean,
) {
  const rnd = makeRandom(spec.randomSeed + (isPrevious ? 7 : 0));

  let roster = await listMembers(officeId, month.id);
  if (roster.length === 0) {
    for (const m of spec.memberList) {
      await db.insert(membersTable).values({
        id: cryptoId("mem"),
        officeId,
        monthId: month.id,
        name: m.name,
        role: m.phone === spec.manager.phone ? "manager" : "member",
        isActive: true,
        phone: m.phone,
        note: "",
        joinedAt: new Date(`${year}-${String(monthNum).padStart(2, "0")}-01T09:00:00+06:00`),
      });
    }
    roster = await listMembers(officeId, month.id);
    console.log(`    + ${roster.length} members → ${month.id}`);
  } else {
    console.log(`    ✓ ${roster.length} members already in ${month.id}`);
  }

  /* ── daily meals ────────────────────────────────────── */
  const existingMeals = await db.select({ id: dailyMeals.id }).from(dailyMeals).where(eq(dailyMeals.monthId, month.id)).limit(1);
  if (existingMeals.length === 0) {
    const lastDay = isPrevious ? month.totalDays : Math.min(dhakaNow().day, month.totalDays);
    const rows: (typeof dailyMeals.$inferInsert)[] = [];
    for (let day = 1; day <= lastDay; day++) {
      const iso = isoOfDay(year, monthNum, day);
      for (const m of roster) {
        const roll = rnd();
        let meals = 0;
        if (roll > 0.12) meals = roll > 0.75 ? 2 : roll > 0.4 ? 1.5 : 1;
        if (roll > 0.965) meals = 2.5;
        if (meals === 0) continue;
        rows.push({
          id: cryptoId("meal"),
          officeId,
          monthId: month.id,
          memberId: m.id,
          day,
          date: iso,
          meals: String(meals),
          note: "",
          createdBy: "seed",
        });
      }
    }
    if (rows.length) {
      for (let i = 0; i < rows.length; i += 400) {
        await db.insert(dailyMeals).values(rows.slice(i, i + 400)).onConflictDoNothing();
      }
      console.log(`    + ${rows.length} meal rows (day 1–${lastDay})`);
    }
  }

  /* ── bazar ──────────────────────────────────────────── */
  const existingBazar = await db.select({ id: bazarExpenses.id }).from(bazarExpenses).where(eq(bazarExpenses.monthId, month.id)).limit(1);
  if (existingBazar.length === 0) {
    const lastDay = isPrevious ? month.totalDays : Math.min(dhakaNow().day, month.totalDays);
    const rows: (typeof bazarExpenses.$inferInsert)[] = [];
    for (let day = 1; day <= lastDay; day += 2) {
      const pick = BAZAR_ITEMS[Math.floor(rnd() * BAZAR_ITEMS.length)]!;
      const buyer = roster[Math.floor(rnd() * roster.length)]!;
      const amount = Math.round((pick.min + rnd() * (pick.max - pick.min)) / 5) * 5;
      rows.push({
        id: cryptoId("bzr"),
        officeId,
        monthId: month.id,
        date: isoOfDay(year, monthNum, day),
        day,
        memberId: buyer.id,
        buyerName: buyer.name,
        category: pick.category,
        items: pick.items,
        amount: String(amount),
        note: day % 6 === 1 ? "Morning market" : "",
        createdBy: "seed",
      });
    }
    if (rows.length) await db.insert(bazarExpenses).values(rows);
    console.log(`    + ${rows.length} bazar entries`);
  }

  /* ── permanent fund deposits ────────────────────────── */
  const existingDeposits = await db.select({ id: deposits.id }).from(deposits).where(eq(deposits.monthId, month.id)).limit(1);
  if (existingDeposits.length === 0) {
    const rows: (typeof deposits.$inferInsert)[] = [];
    spec.memberList.forEach((m, i) => {
      const member = roster.find((r) => r.phone === m.phone);
      const amount = isPrevious ? Math.round(m.fund * 0.6) : m.fund;
      if (!member || amount <= 0) return;
      rows.push({
        id: cryptoId("dep"),
        officeId,
        monthId: month.id,
        date: isoOfDay(year, monthNum, Math.min(5 + i, month.totalDays)),
        day: Math.min(5 + i, month.totalDays),
        memberId: member.id,
        memberName: member.name,
        amount: String(amount),
        note: "Permanent capital deposit",
        type: "permanent_fund",
        createdBy: "seed",
      });
    });
    if (rows.length) await db.insert(deposits).values(rows);
    console.log(`    + ${rows.length} fund deposits`);
  }

  /* ── other income ───────────────────────────────────── */
  const existingIncome = await db.select({ id: otherIncomes.id }).from(otherIncomes).where(eq(otherIncomes.monthId, month.id)).limit(1);
  if (existingIncome.length === 0) {
    const rows: (typeof otherIncomes.$inferInsert)[] = [
      {
        id: cryptoId("inc"),
        officeId,
        monthId: month.id,
        date: isoOfDay(year, monthNum, Math.min(8, month.totalDays)),
        day: Math.min(8, month.totalDays),
        title: "Guest meal income",
        amount: String(isPrevious ? 900 : 1400),
        note: "৩ জন গেস্ট",
        createdBy: "seed",
      },
      {
        id: cryptoId("inc"),
        officeId,
        monthId: month.id,
        date: isoOfDay(year, monthNum, Math.min(18, month.totalDays)),
        day: Math.min(18, month.totalDays),
        title: "Old furniture sale",
        amount: String(isPrevious ? 600 : 800),
        note: "",
        createdBy: "seed",
      },
    ];
    await db.insert(otherIncomes).values(rows);
    console.log(`    + ${rows.length} other income entries`);
  }

  /* ── extra expenses ─────────────────────────────────── */
  const existingExtras = await db.select({ id: extraExpenses.id }).from(extraExpenses).where(eq(extraExpenses.monthId, month.id)).limit(1);
  if (existingExtras.length === 0) {
    const individualTarget = roster[1];
    const rows: (typeof extraExpenses.$inferInsert)[] = [
      {
        id: cryptoId("ext"),
        officeId,
        monthId: month.id,
        date: isoOfDay(year, monthNum, Math.min(10, month.totalDays)),
        day: Math.min(10, month.totalDays),
        title: "Gas bill",
        amount: String(isPrevious ? 800 : 1000),
        type: "shared",
        memberId: null,
        memberName: "",
        note: "সব সক্রিয় সদস্যের মধ্যে ভাগ হবে",
        createdBy: "seed",
      },
      {
        id: cryptoId("ext"),
        officeId,
        monthId: month.id,
        date: isoOfDay(year, monthNum, Math.min(14, month.totalDays)),
        day: Math.min(14, month.totalDays),
        title: "মেস মেরামত",
        amount: "300",
        type: "individual",
        memberId: individualTarget?.id ?? null,
        memberName: individualTarget?.name ?? "",
        note: "নির্দিষ্ট সদস্যের খরচ",
        createdBy: "seed",
      },
    ];
    await db.insert(extraExpenses).values(rows);
    console.log(`    + ${rows.length} extra expenses`);
  }

  /* ── close the previous month so it is read-only ────── */
  if (isPrevious) {
    await db.update(messMonths).set({ isClosed: true, note: "Closed after monthly settlement" }).where(eq(messMonths.id, month.id));
    console.log(`    🔒 previous month closed (view only)`);
  }
}

async function main() {
  console.log("═══ Mess Meal Manager — database seed ═══");
  const now = dhakaNow();
  const year = now.year;
  const month = now.month;
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };

  console.log(`  Dhaka today: ${now.iso} → seeding ${monthLabel(year, month)} (+ ${monthLabel(prev.y, prev.m)})`);

  await seedAdmin();

  for (const spec of OFFICES) {
    await seedOffice(spec, year, month, prev.y, prev.m);
  }

  /* ── summary ────────────────────────────────────────── */
  const allOffices = await db.select({ id: offices.id, name: offices.name, code: offices.code }).from(offices);
  const allUsers = await db.select({ id: users.id }).from(users);
  const allMonths = await db.select({ id: messMonths.id }).from(messMonths);
  const allMembers = await db.select({ id: membersTable.id }).from(membersTable);
  const allMeals = await db.select({ id: dailyMeals.id }).from(dailyMeals);
  const allBazar = await db.select({ id: bazarExpenses.id }).from(bazarExpenses);

  console.log("\n═══ Seed summary ═══");
  console.log(`  offices : ${allOffices.length}  (${allOffices.map((o) => `${o.name}=${o.code}`).join(", ")})`);
  console.log(`  users   : ${allUsers.length}`);
  console.log(`  months  : ${allMonths.length}`);
  console.log(`  members : ${allMembers.length}`);
  console.log(`  meals   : ${allMeals.length}`);
  console.log(`  bazar   : ${allBazar.length}`);
  console.log(`\n  Platform admin : ${ADMIN_USER_ID} / ${ADMIN_PASSWORD}`);
  console.log(`  Gobra manager  : 01711111111 / manager123`);
  console.log(`  Gobra member   : 01722222222 / member123`);
  console.log(`  Gobra audit    : 01733333333 / audit123`);
  console.log(`  Pending member : 01799999999 / member123  (approval demo)`);
  console.log(`\n  ⚠ প্রোডাকশনে ডিপ্লয় করার আগে এই ডেমো পাসওয়ার্ডগুলো অবশ্যই পরিবর্তন করুন।`);

}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ Seed failed:", err);
    process.exit(1);
  });
