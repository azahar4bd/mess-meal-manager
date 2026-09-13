/* End-to-end API verification for Mess Meal Manager. Run: node scripts/test-api.mjs */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";

let pass = 0;
let fail = 0;
const failures = [];

function jar() {
  return { cookie: "" };
}

async function req(j, method, path, body, raw = false) {
  const headers = {};
  if (j.cookie) headers.cookie = j.cookie;
  const hasBody = body !== undefined && method !== "GET" && method !== "HEAD";
  if (hasBody) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  if (raw) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const [name] = pair.split("=");
      const others = j.cookie.split("; ").filter((p) => p && !p.startsWith(`${name}=`)).join("; ");
      j.cookie = [others, pair].filter(Boolean).join("; ");
    }
    return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(";");
    const [name] = pair.split("=");
    const others = j.cookie
      .split("; ")
      .filter((p) => p && !p.startsWith(`${name}=`))
      .join("; ");
    j.cookie = [others, pair].filter(Boolean).join("; ");
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name + (extra ? ` → ${extra}` : ""));
    console.log(`  ✗ ${name} ${extra}`);
  }
}

const stamp = Date.now().toString().slice(-6);

async function main() {
  console.log(`\n═══ E2E API tests → ${BASE} ═══\n`);

  /* ── 0. clear in-memory rate limits so repeated runs are not throttled ── */
  {
    const secret = process.env.RATE_LIMIT_RESET_SECRET ?? "";
    const res = await fetch(`${BASE}/api/dev/reset-rate-limits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    if (res.status === 200) {
      const b = await res.json();
      console.log(`   rate limiter cleared (${b.clearedBuckets ?? 0} buckets)\n`);
    } else {
      console.log(`   rate limiter NOT cleared (status ${res.status}) — set RATE_LIMIT_RESET_SECRET or log in as admin\n`);
    }
  }

  /* ── 1. health ─────────────────────────────────────── */
  console.log("1) Health");
  const h = await req(jar(), "GET", "/api/health");
  check("GET /api/health returns ok", h.status === 200 && h.json?.ok === true, `status=${h.status}`);
  check("database reports online", h.json?.database?.ok === true, JSON.stringify(h.json?.database ?? {}).slice(0, 120));
  check("timezone is Asia/Dhaka", h.json?.time?.timezone === "Asia/Dhaka");

  /* ── 2. auth guards ────────────────────────────────── */
  console.log("\n2) Authentication & authorization guards");
  const anon = jar();
  const meAnon = await req(anon, "GET", "/api/auth/me");
  check("GET /api/auth/me without session → 401", meAnon.status === 401, `status=${meAnon.status}`);
  const bootAnon = await req(anon, "POST", "/api/mess", { action: "bootstrap" });
  check("POST /api/mess without session → 401", bootAnon.status === 401, `status=${bootAnon.status}`);

  const badLogin = await req(jar(), "POST", "/api/auth/login", { login: "01700000000", password: "wrong-password" });
  check("login with wrong password → 401", badLogin.status === 401, `status=${badLogin.status}`);

  // brute-force guard: repeated wrong passwords for one login id get throttled
  let throttled = 0;
  for (let i = 0; i < 16; i++) {
    const r = await req(jar(), "POST", "/api/auth/login", { login: "01799999998", password: "wrong" });
    if (r.status === 429) throttled++;
  }
  check("brute-force login attempts get rate limited (429)", throttled > 0, `429 count=${throttled}`);

  /* ── 3. admin login ────────────────────────────────── */
  console.log("\n3) Platform admin");
  const admin = jar();
  const adminLogin = await req(admin, "POST", "/api/auth/login", { login: "01700000000", password: "admin" });
  check("admin login ok", adminLogin.status === 200 && adminLogin.json?.ok === true, adminLogin.text.slice(0, 160));
  check("admin role = admin", adminLogin.json?.data?.user?.role === "admin");
  check("admin home = dashboard", adminLogin.json?.data?.home === "dashboard");
  check("admin got an active office (switcher default)", Boolean(adminLogin.json?.data?.activeOfficeId), String(adminLogin.json?.data?.activeOfficeId));

  const adminMe = await req(admin, "GET", "/api/auth/me");
  check("admin /me lists all offices", (adminMe.json?.data?.offices?.length ?? 0) >= 3, `count=${adminMe.json?.data?.offices?.length}`);
  check("admin canSwitchOffice", adminMe.json?.data?.user?.canSwitchOffice === true);

  const officesList = await req(admin, "POST", "/api/mess", { action: "admin.offices.list" });
  check("admin.offices.list works", officesList.status === 200 && Array.isArray(officesList.json?.data?.data), officesList.text.slice(0, 160));
  const officeRows = officesList.json?.data?.data ?? [];
  const gobra = officeRows.find((o) => o.id === "office_gobra");
  const barishal = officeRows.find((o) => o.id === "office_barishal");
  check("seeded office_gobra present with manager + months", Boolean(gobra) && gobra.monthCount >= 2, JSON.stringify(gobra ?? {}).slice(0, 160));
  check("seeded office_barishal present", Boolean(barishal));

  /* ── 4. manager login + office isolation ───────────── */
  console.log("\n4) Manager + office isolation");
  const mgr = jar();
  const mgrLogin = await req(mgr, "POST", "/api/auth/login", { login: "01711111111", password: "manager123" });
  check("manager login ok", mgrLogin.status === 200 && mgrLogin.json?.ok === true, mgrLogin.text.slice(0, 160));
  check("manager role = manager", mgrLogin.json?.data?.user?.role === "manager");
  check("manager home = meals", mgrLogin.json?.data?.home === "meals");
  check("manager office = office_gobra", mgrLogin.json?.data?.user?.officeId === "office_gobra");

  const mgrMe = await req(mgr, "GET", "/api/auth/me");
  check("manager sees only own office in list", (mgrMe.json?.data?.offices?.length ?? 0) === 0, `count=${mgrMe.json?.data?.offices?.length}`);
  check("manager menu has no admin tab", !(mgrMe.json?.data?.menu ?? []).some((m) => m.tab === "admin"));

  const mgrBoot = await req(mgr, "POST", "/api/mess", { action: "bootstrap" });
  const boot = mgrBoot.json?.data?.data;
  check("manager bootstrap ok", mgrBoot.status === 200 && Boolean(boot), mgrBoot.text.slice(0, 200));
  check("bootstrap office is Gobra", boot?.office?.id === "office_gobra");
  check("bootstrap has seeded members", (boot?.data?.members?.length ?? 0) >= 6, `members=${boot?.data?.members?.length}`);
  check("bootstrap has seeded meals", (boot?.data?.dailyMeals?.length ?? 0) > 50, `meals=${boot?.data?.dailyMeals?.length}`);
  check("monthId format = officeId-YYYY-MM", /^office_gobra-\d{4}-\d{2}$/.test(boot?.data?.id ?? ""), boot?.data?.id);
  check("months list includes previous month", (boot?.months?.length ?? 0) >= 2, `months=${boot?.months?.length}`);

  const s = boot?.summary;
  check("summary.totalMill > 0", (s?.totalMill ?? 0) > 0, String(s?.totalMill));
  check("meal rate = (bazar − income) / meals", Math.abs((s?.perMillRate ?? 0) - Math.round(((s?.netCost ?? 0) / (s?.totalMill || 1)) * 100) / 100) < 0.011, `rate=${s?.perMillRate} net=${s?.netCost} meals=${s?.totalMill}`);
  check("netCost = bazar − otherIncome", Math.abs((s?.netCost ?? 0) - ((s?.totalBazarCost ?? 0) - (s?.totalOthersIncome ?? 0))) < 0.01, `${s?.netCost}`);
  const calc0 = s?.memberCalculations?.[0];
  check("member totalCost = mealCost + individual + shared", calc0 && Math.abs(calc0.totalCost - (calc0.mealCost + calc0.individualExtra + calc0.sharedExtra)) < 0.01, JSON.stringify(calc0 ?? {}).slice(0, 140));
  check("member permanentFund is NOT subtracted from totalCost", calc0 && calc0.totalCost >= calc0.mealCost && !calc0.totalCost.toString().includes("-"), `total=${calc0?.totalCost} fund=${calc0?.permanentFund}`);
  check("denaPoana = deposit − totalCost", calc0 && Math.abs(calc0.denaPoana - (calc0.totalDeposit - calc0.totalCost)) < 0.01, `${calc0?.denaPoana}`);

  // cross-office access attempt
  const crossOffice = await req(mgr, "POST", "/api/mess", { action: "month.data", monthId: "office_barishal-2026-09" });
  check("manager cannot read another office's month → 403", crossOffice.status === 403, `status=${crossOffice.status} ${crossOffice.text.slice(0, 100)}`);

  const adminOnly = await req(mgr, "POST", "/api/mess", { action: "admin.offices.list" });
  check("manager cannot list all offices → 403", adminOnly.status === 403, `status=${adminOnly.status}`);

  const switchAttempt = await req(mgr, "POST", "/api/mess", { action: "office.switch", officeId: "office_barishal" });
  check("manager cannot switch office → 403", switchAttempt.status === 403, `status=${switchAttempt.status}`);

  /* ── 5. writes (manager) ───────────────────────────── */
  console.log("\n5) Manager writes: meals, bazar, fund, income, extras");
  const monthId = boot.data.id;
  const members = boot.data.members;
  const target = members[0];
  const day = Math.min(boot.data.totalDays, new Date().getUTCDate() + 6 > boot.data.totalDays ? 3 : 4);
  const iso = `${boot.data.year}-${String(boot.data.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const saveMeals = await req(mgr, "POST", "/api/mess", {
    action: "meals.saveDay",
    monthId,
    date: iso,
    entries: members.map((m, i) => ({ memberId: m.id, meals: [2, 1.5, 1, 0, 2.5, 3][i % 6] })),
  });
  check("meals.saveDay ok", saveMeals.status === 200 && saveMeals.json?.ok === true, saveMeals.text.slice(0, 200));

  const afterSave = await req(mgr, "POST", "/api/mess", { action: "meals.list", monthId });
  const dayRows = (afterSave.json?.data?.data ?? []).filter((r) => r.day === day);
  check("saved day has exactly one row per member (no duplicates)", dayRows.length === members.filter((m, i) => [2, 1.5, 1, 0, 2.5, 3][i % 6] > 0).length, `rows=${dayRows.length}`);

  const saveAgain = await req(mgr, "POST", "/api/mess", {
    action: "meals.saveDay",
    monthId,
    date: iso,
    entries: [{ memberId: target.id, meals: 4 }],
  });
  const afterAgain = await req(mgr, "POST", "/api/mess", { action: "meals.list", monthId });
  const targetRows = (afterAgain.json?.data?.data ?? []).filter((r) => r.day === day && r.memberId === target.id);
  check("re-saving the same day updates instead of duplicating", saveAgain.status === 200 && targetRows.length === 1 && Number(targetRows[0].meals) === 4, `rows=${targetRows.length} meals=${targetRows[0]?.meals}`);

  const zeroOut = await req(mgr, "POST", "/api/mess", { action: "meal.set", monthId, memberId: target.id, day, meals: 0 });
  const afterZero = await req(mgr, "POST", "/api/mess", { action: "meals.list", monthId });
  const zeroRows = (afterZero.json?.data?.data ?? []).filter((r) => r.day === day && r.memberId === target.id);
  check("meal = 0 removes the row", zeroOut.status === 200 && zeroRows.length === 0, `rows=${zeroRows.length}`);

  const badMeal = await req(mgr, "POST", "/api/mess", { action: "meal.set", monthId, memberId: target.id, day, meals: -5 });
  check("negative meal rejected", badMeal.status !== 200 || badMeal.json?.ok === false, `status=${badMeal.status}`);

  const badDate = await req(mgr, "POST", "/api/mess", { action: "bazar.create", monthId, date: "2030-01-15", buyerName: "X", amount: 100, category: "Meat" });
  check("bazar entry outside the month rejected", badDate.status === 400 || badDate.json?.ok === false, `status=${badDate.status} ${badDate.text.slice(0, 90)}`);

  const negAmount = await req(mgr, "POST", "/api/mess", { action: "bazar.create", monthId, date: iso, buyerName: "X", amount: -500, category: "Meat" });
  const negStored = negAmount.json?.data?.data?.amount;
  check("negative amount cannot be stored", negAmount.status !== 200 || Number(negStored) >= 0, `amount=${negStored}`);

  const bazar = await req(mgr, "POST", "/api/mess", {
    action: "bazar.create",
    monthId,
    date: iso,
    memberId: target.id,
    buyerName: target.name,
    category: "Vegetables",
    items: "Potato, Onion",
    amount: 500,
    note: "Morning market",
  });
  const bazarRow = bazar.json?.data?.data;
  check("bazar.create ok", bazar.status === 200 && Number(bazarRow?.amount) === 500, bazar.text.slice(0, 160));
  check("bazar date stored as YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(bazarRow?.date ?? ""), bazarRow?.date);

  const bazarEdit = await req(mgr, "POST", "/api/mess", { action: "bazar.update", monthId, id: bazarRow.id, date: iso, buyerName: target.name, category: "Meat", items: "Beef", amount: 750, note: "edited" });
  check("bazar.update ok", bazarEdit.status === 200 && Number(bazarEdit.json?.data?.data?.amount) === 750, bazarEdit.text.slice(0, 140));

  const dep = await req(mgr, "POST", "/api/mess", { action: "deposit.create", monthId, date: iso, memberId: target.id, amount: 2000, note: "permanent capital", type: "permanent_fund" });
  check("deposit.create ok (permanent_fund)", dep.status === 200 && dep.json?.data?.data?.type === "permanent_fund", dep.text.slice(0, 140));

  const inc = await req(mgr, "POST", "/api/mess", { action: "income.create", monthId, date: iso, title: "Guest meal", amount: 500, note: "" });
  check("income.create ok", inc.status === 200 && Number(inc.json?.data?.data?.amount) === 500, inc.text.slice(0, 140));

  const shared = await req(mgr, "POST", "/api/mess", { action: "extra.create", monthId, date: iso, title: "Gas bill", amount: 1000, type: "shared" });
  check("extra.create shared ok", shared.status === 200 && shared.json?.data?.data?.type === "shared", shared.text.slice(0, 140));

  const individualNoMember = await req(mgr, "POST", "/api/mess", { action: "extra.create", monthId, date: iso, title: "Repair", amount: 300, type: "individual" });
  check("individual extra without member rejected", individualNoMember.status !== 200, `status=${individualNoMember.status}`);

  const individual = await req(mgr, "POST", "/api/mess", { action: "extra.create", monthId, date: iso, title: "Repair", amount: 300, type: "individual", memberId: target.id });
  check("individual extra with member ok", individual.status === 200, individual.text.slice(0, 140));

  /* verify shared extra split + individual assignment in the report */
  const report = await req(mgr, "POST", "/api/mess", { action: "report.summary", monthId });
  const rs = report.json?.data?.data?.summary;
  const active = rs?.activeMembers ?? 0;
  const expectShared = Math.round(((rs?.totalSharedExtra ?? 0) / (active || 1)) * 100) / 100;
  const targetCalc = (rs?.memberCalculations ?? []).find((c) => c.memberId === target.id);
  check("shared extra split equally among active members", targetCalc && Math.abs(targetCalc.sharedExtra - expectShared) < 0.02, `got=${targetCalc?.sharedExtra} expect=${expectShared}`);
  check("individual extra assigned to that member only", targetCalc && targetCalc.individualExtra >= 300, `individual=${targetCalc?.individualExtra}`);
  check("report has separate PermanentFund + DenaPoana columns", targetCalc && "permanentFund" in targetCalc && "denaPoana" in targetCalc);
  check("report status is দিবে/পাবে/সমান", ["দিবে", "পাবে", "সমান"].includes(targetCalc?.status), targetCalc?.status);

  const ranged = await req(mgr, "POST", "/api/mess", { action: "report.summary", monthId, fromDate: `${boot.data.year}-${String(boot.data.month).padStart(2, "0")}-01`, toDate: iso });
  check("date-range report works", ranged.status === 200 && (ranged.json?.data?.data?.summary?.totalMill ?? -1) >= 0, ranged.text.slice(0, 120));

  /* ── 6. previous month protection ──────────────────── */
  console.log("\n6) Month isolation & closed-month protection");
  const prevMonth = (boot.months ?? []).find((m) => m.id !== monthId);
  const prevData = await req(mgr, "POST", "/api/mess", { action: "month.data", monthId: prevMonth.id });
  check("previous month is still viewable", prevData.status === 200 && (prevData.json?.data?.data?.data?.dailyMeals?.length ?? 0) > 0, `meals=${prevData.json?.data?.data?.data?.dailyMeals?.length}`);
  check("previous month is marked closed", prevData.json?.data?.data?.month?.isClosed === true);
  const closedWrite = await req(mgr, "POST", "/api/mess", { action: "bazar.create", monthId: prevMonth.id, date: `${prevMonth.year ?? boot.data.year}-${String(prevMonth.month ?? boot.data.month).padStart(2, "0")}-05`, buyerName: "X", amount: 10, category: "Other" });
  check("manager cannot write into a closed month → 403", closedWrite.status === 403, `status=${closedWrite.status}`);
  const adminClosedWrite = await req(admin, "POST", "/api/mess", { action: "month.data", monthId: prevMonth.id });
  check("admin can still read the closed month", adminClosedWrite.status === 200);

  const opened = await req(admin, "POST", "/api/mess", { action: "office.switch", officeId: "office_gobra" });
  check("admin office.switch works", opened.status === 200 && opened.json?.data?.data?.activeOfficeId === "office_gobra", opened.text.slice(0, 120));

  /* ── 7. member role ────────────────────────────────── */
  console.log("\n7) Member role (report only)");
  const mem = jar();
  const memLogin = await req(mem, "POST", "/api/auth/login", { login: "01722222222", password: "member123" });
  check("member login ok", memLogin.status === 200 && memLogin.json?.ok === true, memLogin.text.slice(0, 160));
  check("member home = report", memLogin.json?.data?.home === "report");
  const memMenu = (await req(mem, "GET", "/api/auth/me")).json?.data?.menu ?? [];
  check("member menu = Reports only (spec §70)", JSON.stringify(memMenu.map((m) => m.tab)) === JSON.stringify(["report"]), JSON.stringify(memMenu.map((m) => m.tab)));
  const memMeals = await req(mem, "POST", "/api/mess", { action: "meals.list", monthId });
  check("member cannot read the raw meal ledger → 403", memMeals.status === 403, `status=${memMeals.status}`);
  const memMonthData = await req(mem, "POST", "/api/mess", { action: "month.data", monthId });
  check("member cannot read raw month data → 403", memMonthData.status === 403, `status=${memMonthData.status}`);
  const memReport = await req(mem, "POST", "/api/mess", { action: "report.summary", monthId });
  check("member report shows ONLY their own row", (memReport.json?.data?.data?.summary?.memberCalculations?.length ?? 99) === 1, `rows=${memReport.json?.data?.data?.summary?.memberCalculations?.length}`);
  check("member report flagged selfOnly", memReport.json?.data?.data?.selfOnly === true);
  const memWrite = await req(mem, "POST", "/api/mess", { action: "bazar.create", monthId, date: iso, buyerName: "hack", amount: 999, category: "Other" });
  check("member cannot write bazar → 403", memWrite.status === 403, `status=${memWrite.status}`);
  const memMeal = await req(mem, "POST", "/api/mess", { action: "meals.saveDay", monthId, date: iso, entries: [{ memberId: target.id, meals: 9 }] });
  check("member cannot write meals → 403", memMeal.status === 403, `status=${memMeal.status}`);
  const memMember = await req(mem, "POST", "/api/mess", { action: "member.create", monthId, name: "Ghost Member" });
  check("member cannot create members → 403", memMember.status === 403, `status=${memMember.status}`);
  const memSync = await req(mem, "POST", "/api/mess", { action: "sheet.sync", monthId });
  check("member cannot trigger sheet sync → 403", memSync.status === 403, `status=${memSync.status}`);

  /* ── 8. audit role ─────────────────────────────────── */
  console.log("\n8) Audit role (read-only)");
  const aud = jar();
  const audLogin = await req(aud, "POST", "/api/auth/login", { login: "01733333333", password: "audit123" });
  check("audit login ok", audLogin.status === 200 && audLogin.json?.ok === true, audLogin.text.slice(0, 160));
  check("audit home = report", audLogin.json?.data?.home === "report");
  const audReport = await req(aud, "POST", "/api/mess", { action: "report.summary", monthId });
  check("audit sees the FULL report", (audReport.json?.data?.data?.summary?.memberCalculations?.length ?? 0) >= 6, `rows=${audReport.json?.data?.data?.summary?.memberCalculations?.length}`);
  const audWrite = await req(aud, "POST", "/api/mess", { action: "deposit.create", monthId, date: iso, memberId: target.id, amount: 1, type: "permanent_fund" });
  check("audit cannot write → 403", audWrite.status === 403, `status=${audWrite.status}`);
  const audAudit = await req(aud, "POST", "/api/mess", { action: "audit.list" });
  check("audit role can read the audit trail", audAudit.status === 200 && Array.isArray(audAudit.json?.data?.data), `status=${audAudit.status}`);
  const mgrAudit = await req(mgr, "POST", "/api/mess", { action: "audit.list" });
  check("manager cannot read the audit trail → 403", mgrAudit.status === 403, `status=${mgrAudit.status}`);
  const audMeals = await req(aud, "POST", "/api/mess", { action: "meals.list", monthId });
  check("audit can read the ledger (read-only)", audMeals.status === 200, `status=${audMeals.status}`);

  /* ── 9. exports ────────────────────────────────────── */
  console.log("\n9) CSV / PDF exports");
  const csv = await req(mgr, "GET", `/api/report/export?format=csv&variant=full&monthId=${monthId}`);
  check("CSV export 200 + text/csv", csv.status === 200 && (csv.headers.get("content-type") ?? "").includes("text/csv"), csv.headers.get("content-type") ?? "");
  const csvRaw = await req(mgr, "GET", `/api/report/export?format=csv&variant=full&monthId=${monthId}`, undefined, true);
  check("CSV starts with a UTF-8 BOM (Excel-friendly Bangla)", csvRaw.bytes[0] === 0xef && csvRaw.bytes[1] === 0xbb && csvRaw.bytes[2] === 0xbf, csvRaw.bytes.slice(0, 4).toString("hex"));
  check("CSV contains member summary header", csv.text.includes("MemberID") && csv.text.includes("PermanentFund") && csv.text.includes("DenaPoana"));
  check("CSV filename header set", (csv.headers.get("content-disposition") ?? "").includes(".csv"), csv.headers.get("content-disposition") ?? "");
  const csvMembers = await req(mgr, "GET", `/api/report/export?format=csv&variant=members&monthId=${monthId}`);
  check("CSV variant=members works", csvMembers.status === 200 && csvMembers.text.includes("TotalMeals"));
  const html = await req(mgr, "GET", `/api/report/export?format=html&monthId=${monthId}`);
  check("PDF/print HTML export 200 + text/html", html.status === 200 && (html.headers.get("content-type") ?? "").includes("text/html"));
  check("PDF document contains Bangla report sections", html.text.includes("সদস্য হিসাব সামারি") && html.text.includes("দেনা-পাওনা") && html.text.includes("স্থায়ী তহবিল"));
  check("PDF document has office name + month", html.text.includes("Gobra Mess") && html.text.includes("September 2026"));
  check("PDF document has print styling (@page A4)", html.text.includes("@page") && html.text.includes("window.print"));
  const memCsv = await req(mem, "GET", `/api/report/export?format=csv&variant=members&monthId=${monthId}`);
  const memCsvLines = memCsv.text.split(/\r?\n/).filter((l) => l.includes("mem_"));
  check("member CSV export contains only their own row", memCsv.status === 200 && memCsvLines.length <= 1, `lines=${memCsvLines.length}`);

  /* ── 10. google sheets sync ────────────────────────── */
  console.log("\n10) Google Sheets sync");
  const payload = await req(mgr, "POST", "/api/mess", { action: "sheet.payload", monthId });
  const p = payload.json?.data?.data;
  check("sheet.payload builds 8 tabs", (p?.sheets?.length ?? 0) === 8, `tabs=${p?.sheets?.length}`);
  const tabNames = (p?.sheets ?? []).map((x) => x.name);
  check(
    "tab names match the spec exactly",
    JSON.stringify(tabNames) ===
      JSON.stringify([
        "00_অফিস_ইনফো",
        "01_সদস্য_তালিকা",
        "02_দৈনিক_মিল_খাতা",
        "03_বাজার_খরচ",
        "04_জমা_ও_তহবিল",
        "05_অন্যান্য_আয়",
        "06_হিসাব_সামারি",
        "07_দেনা_পাওনা",
      ]),
    JSON.stringify(tabNames),
  );
  const mealTab = p?.sheets?.find((x) => x.name.startsWith("02"));
  check("meal tab columns match spec", JSON.stringify(mealTab?.headers) === JSON.stringify(["MonthID", "Year", "Month", "Day", "Date", "MemberID", "MemberName", "Meals"]), JSON.stringify(mealTab?.headers));
  check("meal tab has data rows", (mealTab?.rows?.length ?? 0) > 10, `rows=${mealTab?.rows?.length}`);
  const summaryTab = p?.sheets?.find((x) => x.name.startsWith("06"));
  check("summary tab has the KPI columns", (summaryTab?.headers ?? []).includes("MealRate") && (summaryTab?.headers ?? []).includes("LastBalance"));
  const dpTab = p?.sheets?.find((x) => x.name.startsWith("07"));
  check("dena-poana tab has separate fund + dena columns", (dpTab?.headers ?? []).includes("PermanentFund") && (dpTab?.headers ?? []).includes("DenaPoana"));

  const sync = await req(mgr, "POST", "/api/sync", { action: "sync", monthId });
  check("sync without Apps Script URL fails gracefully (200/502 + ok:false)", sync.json?.ok === false && /Apps Script|URL/.test(sync.json?.message ?? ""), `${sync.status} ${sync.json?.message ?? ""}`.slice(0, 140));
  check("database write still succeeded after failed sync", (await req(mgr, "POST", "/api/mess", { action: "bazar.list", monthId })).status === 200);
  const status = await req(mgr, "GET", "/api/sync?action=status");
  check("sync log recorded the failed attempt", Array.isArray(status.json?.data?.logs) && status.json.data.logs.length >= 1, JSON.stringify(status.json?.data?.logs?.[0] ?? {}).slice(0, 120));
  const ping = await req(mgr, "POST", "/api/mess", { action: "sheet.ping", monthId });
  check("sheet.ping reports configuration state", ping.status === 200 && ping.json?.ok === true);

  /* ── 11. office signup ─────────────────────────────── */
  console.log("\n11) Office signup flow");
  const su = jar();
  const signup = await req(su, "POST", "/api/auth/signup", {
    officeName: `Nalchity Mess ${stamp}`,
    branch: "Jhalokati",
    userId: `018${stamp}`,
    managerName: "Signup Manager",
    email: `m${stamp}@example.com`,
    phone: `018${stamp}`,
    password: "secret123",
    confirmPassword: "secret123",
  });
  check("office signup ok", signup.status === 200 && signup.json?.ok === true, signup.text.slice(0, 200));
  const newOffice = signup.json?.data?.office;
  check("signup auto-generated an office code", /^[A-Z0-9]+$/.test(newOffice?.code ?? ""), newOffice?.code);
  check("signup created a readable officeId", /^office_/.test(newOffice?.id ?? ""), newOffice?.id);
  check("signup logged the manager in as manager", signup.json?.data?.user?.role === "manager");
  check("signup created the current month", Boolean(signup.json?.data?.month?.id), signup.json?.data?.month?.id);

  const suBoot = await req(su, "POST", "/api/mess", { action: "bootstrap" });
  check("new office starts with 0 meals (isolated)", (suBoot.json?.data?.data?.data?.dailyMeals?.length ?? -1) === 0, `meals=${suBoot.json?.data?.data?.data?.dailyMeals?.length}`);
  check("new office cannot see Gobra data", suBoot.json?.data?.data?.office?.id === newOffice.id);

  const dupSignup = await req(jar(), "POST", "/api/auth/signup", {
    officeName: "Dup Office",
    branch: "X",
    userId: `018${stamp}`,
    managerName: "Dup",
    email: "",
    phone: `018${stamp}`,
    password: "secret123",
    confirmPassword: "secret123",
  });
  check("duplicate userId on signup rejected", dupSignup.status === 409, `status=${dupSignup.status}`);

  const mismatch = await req(jar(), "POST", "/api/auth/signup", {
    officeName: "Mismatch Office",
    branch: "X",
    userId: `019${stamp}`,
    managerName: "MM",
    email: "",
    phone: "",
    password: "secret123",
    confirmPassword: "different",
  });
  check("password mismatch rejected with field error", mismatch.status === 400 && Boolean(mismatch.json?.fields?.confirmPassword), mismatch.text.slice(0, 140));

  /* ── 12. member join + approval ────────────────────── */
  console.log("\n12) Member join + approval flow");
  const jn = jar();
  const join = await req(jn, "POST", "/api/auth/join", {
    name: `Joined Member ${stamp}`,
    phone: `016${stamp}`,
    userId: `016${stamp}`,
    email: "",
    password: "join1234",
    confirmPassword: "join1234",
    officeCode: newOffice.code,
    room: "R1",
  });
  check("member join ok with office code", join.status === 200 && join.json?.ok === true, join.text.slice(0, 200));
  check("joined user status = pending", join.json?.data?.user?.status === "pending");
  check("joined user bound to the right office", join.json?.data?.office?.id === newOffice.id);

  const pendingWrite = await req(jn, "POST", "/api/mess", { action: "member.create", name: "Nope" });
  check("pending user cannot write → 403", pendingWrite.status === 403, `status=${pendingWrite.status}`);

  const badCode = await req(jar(), "POST", "/api/auth/join", {
    name: "Bad Code",
    phone: `015${stamp}`,
    userId: `015${stamp}`,
    password: "join1234",
    confirmPassword: "join1234",
    officeCode: "NOSUCHCODE",
  });
  check("join with invalid office code → 404", badCode.status === 404, `status=${badCode.status}`);

  // manager of the new office approves the joiner
  const suUsers = await req(su, "POST", "/api/mess", { action: "admin.users.list" });
  const joinedUser = (suUsers.json?.data?.data ?? []).find((u) => u.userId === `016${stamp}`);
  check("manager sees the pending joiner in the user list", Boolean(joinedUser) && joinedUser.status === "pending", JSON.stringify(joinedUser ?? {}).slice(0, 120));
  const approve = await req(su, "POST", "/api/mess", { action: "admin.user.status", id: joinedUser?.id, status: "approved" });
  check("manager approves the joiner", approve.status === 200 && approve.json?.data?.data?.status === "approved", approve.text.slice(0, 140));
  const rosterAfter = await req(su, "POST", "/api/mess", { action: "members.list", monthId: signup.json?.data?.month?.id });
  check("approved joiner appears on the month roster", (rosterAfter.json?.data?.data ?? []).some((m) => m.phone === `016${stamp}`), JSON.stringify((rosterAfter.json?.data?.data ?? []).map((m) => m.name)));

  const jnLogin = await req(jar(), "POST", "/api/auth/login", { login: `016${stamp}`, password: "join1234" });
  check("approved member can log in", jnLogin.status === 200 && jnLogin.json?.data?.user?.status === "approved", jnLogin.text.slice(0, 140));

  const pendingLogin = await req(jar(), "POST", "/api/auth/login", { login: "01799999999", password: "member123" });
  check("pending seeded member logs in with requiresApproval flag", pendingLogin.status === 200 && pendingLogin.json?.data?.requiresApproval === true, pendingLogin.text.slice(0, 140));

  /* ── 13. admin office + user management ────────────── */
  console.log("\n13) Admin office & user management");
  const created = await req(admin, "POST", "/api/mess", {
    action: "admin.office.create",
    name: `Admin Created Office ${stamp}`,
    branch: "Test",
    managerName: "Admin Made",
    managerPhone: `013${stamp}`,
    status: "active",
  });
  check("admin can create an office", created.status === 200 && Boolean(created.json?.data?.data?.id), created.text.slice(0, 140));
  const createdId = created.json?.data?.data?.id;
  const deactivated = await req(admin, "POST", "/api/mess", { action: "admin.office.status", id: createdId, status: "inactive" });
  check("admin can deactivate an office", deactivated.status === 200 && deactivated.json?.data?.data?.status === "inactive");

  const newUser = await req(admin, "POST", "/api/mess", {
    action: "admin.user.create",
    userId: `014${stamp}`,
    name: "Audit Person",
    phone: `014${stamp}`,
    officeId: "office_barishal",
    role: "audit",
    status: "active",
    password: "audit1234",
  });
  check("admin can create a user in any office", newUser.status === 200 && newUser.json?.data?.data?.officeId === "office_barishal", newUser.text.slice(0, 160));

  const resetPw = await req(admin, "POST", "/api/mess", { action: "admin.user.resetPassword", id: newUser.json?.data?.data?.id, password: "brandnew1" });
  check("admin can reset a password", resetPw.status === 200 && resetPw.json?.data?.data?.ok === true, resetPw.text.slice(0, 140));
  const loginNewPw = await req(jar(), "POST", "/api/auth/login", { login: `014${stamp}`, password: "brandnew1" });
  check("login works with the reset password", loginNewPw.status === 200, loginNewPw.text.slice(0, 140));

  const usersList = await req(admin, "POST", "/api/mess", { action: "admin.users.list" });
  check("admin user list never exposes plain passwords", !(usersList.text.includes('"passwordPlain"')) || usersList.text.includes("(hashed)"), usersList.text.slice(0, 120));

  const delOfficeNoConfirm = await req(admin, "POST", "/api/mess", { action: "admin.office.delete", id: createdId, confirm: "wrong" });
  check("office delete requires exact confirmation", delOfficeNoConfirm.status === 400, `status=${delOfficeNoConfirm.status}`);

  const auditTrail = await req(admin, "POST", "/api/mess", { action: "audit.list", scope: "all" });
  check("audit trail records the operations", (auditTrail.json?.data?.data?.length ?? 0) > 5, `rows=${auditTrail.json?.data?.data?.length}`);

  /* ── 14. new month opening ─────────────────────────── */
  console.log("\n14) Month separation");
  const nextM = boot.data.month === 12 ? { y: boot.data.year + 1, m: 1 } : { y: boot.data.year, m: boot.data.month + 1 };
  const opened2 = await req(mgr, "POST", "/api/mess", { action: "month.open", year: nextM.y, month: nextM.m, copyMembers: true, carryForwardBalance: 500 });
  check("manager can open next month", opened2.status === 200 && Boolean(opened2.json?.data?.data?.month?.id), opened2.text.slice(0, 160));
  check("new month copies the roster", (opened2.json?.data?.data?.copiedMembers ?? 0) >= 6, `copied=${opened2.json?.data?.data?.copiedMembers}`);
  const nextData = await req(mgr, "POST", "/api/mess", { action: "month.data", monthId: opened2.json?.data?.data?.month?.id });
  check("new month starts with ZERO meals", (nextData.json?.data?.data?.data?.dailyMeals?.length ?? -1) === 0, `meals=${nextData.json?.data?.data?.data?.dailyMeals?.length}`);
  check("new month keeps its own monthId", nextData.json?.data?.data?.data?.id === `${boot.data.officeId}-${nextM.y}-${String(nextM.m).padStart(2, "0")}`, nextData.json?.data?.data?.data?.id);
  const oldStill = await req(mgr, "POST", "/api/mess", { action: "month.data", monthId });
  check("previous month data is NOT deleted", (oldStill.json?.data?.data?.data?.dailyMeals?.length ?? 0) > 50);
  const memOpenMonth = await req(mem, "POST", "/api/mess", { action: "month.open", year: nextM.y + 1, month: 1 });
  check("member cannot open a month → 403", memOpenMonth.status === 403, `status=${memOpenMonth.status}`);

  /* ── 15. logout + session invalidation ─────────────── */
  console.log("\n15) Logout & session handling");
  const beforeLogout = await req(mgr, "GET", "/api/auth/me");
  check("session valid before logout", beforeLogout.status === 200 && beforeLogout.json?.data?.authenticated === true);
  const logout = await req(mgr, "POST", "/api/auth/logout", {});
  check("logout ok", logout.status === 200);
  const afterLogout = await req(mgr, "GET", "/api/auth/me");
  check("session invalid after logout → 401", afterLogout.status === 401, `status=${afterLogout.status}`);

  /* ── 16. deployment endpoints (Vercel + Neon flow) ─── */
  console.log("\n16) Deployment endpoints");
  {
    const setupRes = await fetch(`${BASE}/api/setup/status`);
    const setup = await setupRes.json();
    check("GET /api/setup/status is public + 200", setupRes.status === 200, `status=${setupRes.status}`);
    check("setup/status reports the schema as migrated", setup?.database?.migrated === true, JSON.stringify(setup?.database));
    check("setup/status finds all 13 app tables (missingTables empty)", setup?.database?.tables >= 13 && (setup?.database?.missingTables ?? []).length === 0, `tables=${setup?.database?.tables} missing=${JSON.stringify(setup?.database?.missingTables)}`);
    check("setup/status names the driver in use", typeof setup?.database?.driver === "string" && setup.database.driver.length > 3, setup?.database?.driver);
    check("setup/status exposes counts only (no credentials)", setup?.counts && !JSON.stringify(setup).includes("password"), JSON.stringify(setup?.counts));
    check("setup/status ready=true for a seeded database", setup?.ready === true, `ready=${setup?.ready}`);
    check("setup/status returns Bengali next steps", Array.isArray(setup?.nextSteps) && setup.nextSteps.length > 0);
    check("/api/health reports driver + pool stats", (await (await fetch(`${BASE}/api/health`)).json())?.database?.driver?.length > 3);

    const migBad = await fetch(`${BASE}/api/migrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "definitely-wrong-secret" }),
    });
    check("POST /api/migrations with a wrong secret → 403", migBad.status === 403, `status=${migBad.status}`);
    const migEmpty = await fetch(`${BASE}/api/migrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    check("POST /api/migrations without a secret → 403", migEmpty.status === 403, `status=${migEmpty.status}`);

    const migSecret = process.env.MIGRATION_SECRET ?? "";
    if (migSecret) {
      const migOk = await fetch(`${BASE}/api/migrations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: migSecret }),
      });
      const migBody = await migOk.json();
      check("POST /api/migrations with the right secret → 200", migOk.status === 200, `status=${migOk.status} ${JSON.stringify(migBody).slice(0, 180)}`);
      check("migration endpoint is idempotent (nothing re-applied)", migBody?.ok === true && migBody?.applied?.length === 0 && (migBody?.skipped?.length > 0 || migBody?.baselined?.length > 0), JSON.stringify({ applied: migBody?.applied, skipped: migBody?.skipped, baselined: migBody?.baselined }));
      const migGet = await fetch(`${BASE}/api/migrations?secret=${encodeURIComponent(migSecret)}`);
      check("GET /api/migrations?secret=… works from a browser", migGet.status === 200, `status=${migGet.status}`);
    } else {
      console.log("  · MIGRATION_SECRET not set — positive migration checks skipped");
    }
  }

  /* ── 17. misc guards ───────────────────────────────── */
  console.log("\n17) Input validation & unknown actions");
  const unknown = await req(admin, "POST", "/api/mess", { action: "does.not.exist" });
  check("unknown action → 400", unknown.status === 400, `status=${unknown.status}`);
  const noAction = await req(admin, "POST", "/api/mess", {});
  check("missing action → 400", noAction.status === 400, `status=${noAction.status}`);
  const badJson = await fetch(`${BASE}/api/mess`, { method: "POST", headers: { cookie: admin.cookie }, body: "{not json" });
  check("malformed JSON body does not crash the server", badJson.status >= 400 && badJson.status < 600, `status=${badJson.status}`);
  const sqli = await req(admin, "POST", "/api/mess", { action: "months.list", monthId: "office_gobra'; DROP TABLE users;--" });
  check("SQL injection attempt is harmless", sqli.status === 200 || sqli.status === 400 || sqli.status === 403, `status=${sqli.status}`);
  const usersStill = await req(admin, "POST", "/api/mess", { action: "admin.users.list" });
  check("users table still intact after injection attempt", usersStill.status === 200 && (usersStill.json?.data?.data?.length ?? 0) > 5);

  /* ── summary ───────────────────────────────────────── */
  console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  • ${f}`));
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
