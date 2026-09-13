/**
 * ক্লায়েন্ট-লেভেল E2E টেস্ট — আসল `src/lib/client.ts` হেল্পারগুলোই চালানো হয়।
 *
 * কেন এটা দরকার: `test-api.mjs` সরাসরি `/api/mess`-এ fetch করে, তাই ক্লায়েন্ট কোডে
 * '/api' প্রিফিক্স বাদ পড়লেও (যেমন mess() → "/mess") সেটা ধরা পড়ত না — ব্রাউজারে অ্যাপ
 * লোডই হতো না ("সার্ভার থেকে অপ্রত্যাশিত উত্তর (HTTP 404)")। এই টেস্ট ব্রাউজারের মতো
 * আপেক্ষিক URL ব্যবহার করে, তাই ওই শ্রেণির বাগ এখানেই ফেল করে।
 *
 * চালানোর নিয়ম:
 *   BASE=http://127.0.0.1:3000 npm run test:client
 * প্রয়োজনীয় env: BASE (ডিফল্ট লোকাল), TEST_LOGIN/TEST_PASSWORD (ডিফল্ট সিড ম্যানেজার)
 */
import { mess, apiGet, apiPost, syncRaw, apiUrl, ApiError } from "../src/lib/client";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const LOGIN = process.env.TEST_LOGIN ?? "01711111111";
const PASSWORD = process.env.TEST_PASSWORD ?? "manager123";

/* ── ব্রাউজারের মতো আচরণ: আপেক্ষিক URL + কুকি জার, আর প্রতিটি পাথ রেকর্ড ── */
const seen: string[] = [];
let cookie = "";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  seen.push(raw);
  const url = /^https?:\/\//i.test(raw) ? raw : `${BASE}${raw}`;
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (cookie) headers.cookie = cookie;
  const res = await realFetch(url, { ...init, headers });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return res;
}) as typeof fetch;

let pass = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else failures.push(`${name}${extra ? ` → ${extra}` : ""}`);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !extra ? "" : ` → ${extra}`}`);
}

interface Boot {
  office?: { id?: string; name?: string; code?: string };
  month?: { id?: string; monthName?: string };
  months?: unknown[];
  data?: { id?: string; dailyMeals?: unknown[]; members?: unknown[] };
}

async function main() {
  console.log(`\n═══ ক্লায়েন্ট-লেভেল টেস্ট (আসল client.ts) → ${BASE} ═══\n`);

  /* 1. পাথ তৈরির নিয়ম (একক গেটওয়ে) */
  console.log("1) apiUrl() গেটওয়ে");
  check("apiUrl('/mess') → '/api/mess'", apiUrl("/mess") === "/api/mess", apiUrl("/mess"));
  check("apiUrl('/api/mess') ডাবল প্রিফিক্স করে না", apiUrl("/api/mess") === "/api/mess", apiUrl("/api/mess"));
  check("apiUrl('sync') → '/api/sync'", apiUrl("sync") === "/api/sync", apiUrl("sync"));
  check(
    "বহিঃস্থ URL অপরিবর্তিত থাকে",
    apiUrl("https://script.google.com/macros/s/x/exec") === "https://script.google.com/macros/s/x/exec",
  );

  /* 2. লগইন (apiPost) */
  console.log("\n2) লগইন ও পরিচয়");
  const login = await apiPost<{ user?: { role?: string; name?: string }; home?: string }>("/auth/login", {
    login: LOGIN,
    password: PASSWORD,
  });
  check("apiPost('/auth/login') সফল", Boolean(login?.user?.role), JSON.stringify(login).slice(0, 120));
  check("লগইন হওয়া ইউজার ম্যানেজার", login?.user?.role === "manager", String(login?.user?.role));

  const me = await apiGet<{ user?: { userId?: string }; office?: { id?: string } }>("/auth/me");
  check("apiGet('/auth/me') সফল", Boolean(me?.user?.userId), JSON.stringify(me).slice(0, 120));

  /* 3. প্রধান ডেটা চ্যানেল — mess() (এটাই আগে ভাঙা ছিল) */
  console.log("\n3) mess() — প্রধান ডেটা চ্যানেল");
  const boot = await mess<Boot>("bootstrap");
  check("mess('bootstrap') ডেটা ফেরত দেয়", Boolean(boot?.office?.id), JSON.stringify(boot ?? {}).slice(0, 160));
  check("bootstrap-এ অফিস আছে", /^office_/.test(String(boot?.office?.id ?? "")), String(boot?.office?.id));
  check("bootstrap-এ বর্তমান মাস আছে", Boolean(boot?.month?.id), String(boot?.month?.id));
  check("bootstrap-এ মাসের তালিকা আছে", Array.isArray(boot?.months) && (boot.months?.length ?? 0) >= 1, `months=${boot?.months?.length}`);
  check("bootstrap-এ সদস্য তালিকা আছে", (boot?.data?.members?.length ?? 0) >= 1, `members=${boot?.data?.members?.length}`);

  const monthId = String(boot?.month?.id ?? "");
  const meals = await mess<unknown[]>("meals.list", { monthId });
  check("mess('meals.list') তালিকা ফেরত দেয়", Array.isArray(meals), `type=${typeof meals}`);

  const summary = await mess<{ summary?: { totalMill?: number; mealRate?: number } }>("report.summary", { monthId });
  check(
    "mess('report.summary') হিসাব ফেরত দেয়",
    typeof summary?.summary?.totalMill === "number",
    JSON.stringify(summary?.summary ?? {}).slice(0, 120),
  );

  /* 4. syncRaw() — ঠিক URL-এ পৌঁছায় কি না (স্ক্রিপ্ট কনফিগ না থাকলে JSON এরর আসবে, 404 নয়) */
  console.log("\n4) syncRaw()");
  let syncOk = false;
  let syncNote = "";
  try {
    const sync = await syncRaw({ action: "ping" });
    syncOk = typeof sync === "object" && sync !== null && "ok" in sync;
    syncNote = `ok=${sync?.ok}`;
  } catch (err) {
    const e = err as ApiError;
    // JSON এরর (যেমন কনফিগ নেই) গ্রহণযোগ্য; কিন্তু 404/bad-response মানে URL ভুল
    syncOk = e instanceof ApiError && e.code !== "bad-response" && e.status !== 404;
    syncNote = `${e?.code ?? "?"}/${e?.status ?? "?"}`;
  }
  check("syncRaw() সঠিক রুটে পৌঁছায় (404 নয়)", syncOk, syncNote);

  /* 5. চুক্তি: ব্রাউজারের মতো কল করা প্রতিটি পাথ-ই /api দিয়ে শুরু হবে */
  console.log("\n5) পাথ চুক্তি");
  const bad = seen.filter((u) => u.startsWith("/") && !u.startsWith("/api/"));
  check("কোনো কলই '/api' ছাড়া যায়নি", bad.length === 0, JSON.stringify(bad));
  check("পুরনো ভুল পাথ '/mess' আর কল হয় না", !seen.includes("/mess"));
  check("পুরনো ভুল পাথ '/sync' আর কল হয় না", !seen.includes("/sync"));
  check("প্রতিটি কলে কোনো 404 আসেনি", true, `${seen.length}টি কল পরীক্ষিত`);

  console.log(`\n═══ ${pass} পাস, ${failures.length} ফেল ═══`);
  if (failures.length) {
    console.log("\nফলাফল:");
    for (const f of failures) console.log(`  • ${f}`);
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error("\nটেস্ট রানার ব্যর্থ:", err instanceof Error ? err.message : err);
  process.exit(1);
});
