# Feature → Implementation Map

স্পেকের প্রতিটি ফিচার কোথায় ইমপ্লিমেন্ট হয়েছে, কোন ফাইলে কী লজিক আছে — এই ডকুমেন্টে তার পূর্ণ ম্যাপ। কোনো ফিচার বাদ পড়েনি; প্রতিটি লাইনের বিপরীতে একটি বাস্তব ফাইল আছে।

---

## 1 · Authentication & onboarding

| ফিচার | Frontend | Backend | Library |
|---|---|---|---|
| লগইন (ইউজার আইডি/ফোন/ইমেইল + পাসওয়ার্ড) | `views/AuthScreen.tsx`, `app/login/page.tsx` | `api/auth/login/route.ts` | `lib/auth.ts`, `lib/password.ts` |
| অফিস সাইনআপ (নতুন মেস + ম্যানেজার + চলতি মাস একসাথে) | `views/AuthScreen.tsx`, `app/signup/page.tsx` | `api/auth/signup/route.ts` | `lib/service.ts` `signupOffice()` → `createOffice()`, `createUser()`, `ensureMonth()` |
| অটো অফিস কোড (`GOBRA01`) ও readable `officeId` | — | 〃 | `lib/random.ts`, `lib/validate.ts` `slugify()` |
| মেম্বার জয়েন (অফিস কোড) → pending | `app/join/page.tsx` | `api/auth/join/route.ts` | `lib/mess-data.ts` |
| অনুমোদন/বাতিল (ম্যানেজার বা অ্যাডমিন) | `views/MembersView.tsx` (অনুমোদন প্যানেল) | `api/mess` → `admin.user.status`, `admin.pendingUsers` | `lib/permissions.ts` (`members.approve`) |
| লগআউট (সেশন DB থেকে ডিলিট) | হেডার (`MessApp.tsx`) | `api/auth/logout/route.ts` | `lib/auth.ts` |
| সেশন রিভ্যালিডেশন / `requiresApproval` | `components/app-context.tsx` | `api/auth/me/route.ts` | `lib/auth.ts` |
| পাসওয়ার্ড পরিবর্তন (নিজের) | হেডার মেনু | `api/mess` → `me.changePassword` | `lib/password.ts` |
| পাসওয়ার্ড রিসেট (অ্যাডমিন/ম্যানেজার) | `views/AdminView.tsx` | `admin.user.resetPassword` | `lib/password.ts` |
| ব্রুট-ফোর্স গার্ড (১২ বার / ১০ মিনিট) | এরর টোস্ট | 〃 | `lib/rate-limit.ts` |

bcrypt cost 10 · HTTP-only cookie · `sessions` টেবিল · ৭ দিন মেয়াদ · প্রোডাকশনে `Secure` ফ্ল্যাগ।

---

## 2 · Role-based authorization (spec §7, §68–70)

| অংশ | ফাইল |
|---|---|
| পারমিশন ম্যাট্রিক্স (৪ রোল × ২৩ capability) | `src/lib/permissions.ts` → `MATRIX`, `can()` |
| রোল-ভিত্তিক মেনু | `permissions.ts` → `MENU`, `menuForRole()` |
| ডিফল্ট হোম ট্যাব | `permissions.ts` → `ROLE_HOME` |
| সার্ভার-সাইড এনফোর্সমেন্ট (প্রতিটি রি퀘স্টে) | `src/lib/api.ts` → `api()` wrapper |
| অ্যাকশন-ভিত্তিক চেক | `src/app/api/mess/route.ts` → প্রতিটি handler-এর প্রথম লাইনে `can(role, cap)` |
| অফিস আইসোলেশন | `mess/route.ts` → `loadOfficePayload()`, `resolveMonth()`, `deny()` |
| ক্লোজড মাস প্রোটেকশন | `mess/route.ts` → `assertWritable()` |
| সদস্যের ডেটা নিজের মধ্যে সীমিত | `mess/route.ts` → `scopeCalcs()` (`selfOnly: true`) |
| পেন্ডিং ইউজার read-only | `lib/api.ts` (write capability ব্লক) |

মেনু: admin = ১০ ট্যাব · manager = ৯ ট্যাব · audit = ৯ ট্যাব (read-only) · **member = ১ ট্যাব (হিসাব/রিপোর্ট)**।

---

## 3 · Multi-office isolation (spec §5, §121-6)

| গ্যারান্টি | ইমপ্লিমেন্টেশন |
|---|---|
| প্রতিটি টেবিলে `office_id` | `src/db/schema.ts` |
| প্রতিটি কুয়েরিতে `officeId` ফিল্টার | `src/lib/mess-data.ts` (সব list/create/update/delete ফাংশন) |
| অন্য অফিসের `monthId` → 403 | `mess/route.ts` → `resolveMonth()` compares `month.officeId === ctx.activeOfficeId` |
| ম্যানেজার `office.switch` করতে পারে না | `mess/route.ts` → admin-only চেক |
| অ্যাডমিন সব অফিস দেখে | `admin.offices.list`, `sessions.current_office_id` |
| নতুন সাইনআপ = সম্পূর্ণ আলাদা অফিস (০ মিল) | `service.signupOffice()` + E2E টেস্ট "new office cannot see Gobra data" |
| এক ইউনিভার্সাল URL | একটি ডিপ্লয়মেন্ট, অফিস-ভিত্তিক ডেটা স্কোপ |

---

## 4 · Month separation (spec §9, §121-7/8)

| ফিচার | কোথায় |
|---|---|
| `monthId = officeId-YYYY-MM` | `lib/date.ts` → `buildMonthId()` |
| চলতি মাস অটো তৈরি (লগইন/বুটস্ট্র্যাপে) | `lib/service.ts` → `ensureCurrentMonth()` |
| নতুন মাস খোলা — মিল ০, রোস্টার কপি অপশন | `month.open` → `mess-data.openMonth()` |
| মাস বন্ধ/পুনরায় খোলা | `month.close` → `setMonthClosed()` |
| পুরনো মাস ভিউ (read-only) | মাস সিলেক্টর (`MessApp.tsx`) + `assertWritable()` |
| রোস্টার কপি (এক মাস থেকে আরেক মাসে) | `month.copyRoster` → `copyRoster()` |
| ক্যারি-ফরোয়ার্ড ব্যালেন্স | `mess_months.carry_forward_balance` (`openMonth({carryForwardBalance})`) |
| মাস-বহির্ভূত তারিখ রিজেক্ট | `mess-data.assertDateInMonth()` |
| `total_days` লিপ-ইয়ার সেফ | `lib/date.ts` `daysInMonth()` |

UI: হেডারের মাস সিলেক্টরে সব মাস; বন্ধ মাসে 🔒 ব্যাজ ও "সম্পাদনা বন্ধ" নোটিশ।

---

## 5 · Daily meal entry (spec §17)

| ফিচার | কোথায় |
|---|---|
| দিন-ভিত্তিক এন্ট্রি (সব সদস্য একসাথে) | `views/MealsView.tsx` (day mode) |
| মাস-গ্রিড এন্ট্রি (সারি=সদস্য, কলাম=দিন) | `views/MealsView.tsx` (grid mode) |
| দশমিক মিল (০.৫, ১.৫, ২.২৫) | `numeric(10,2)` + `lib/validate.ts` |
| ০ = এন্ট্রি মুছে যায় | `saveDayMeals()` / `setMeal()` |
| ডুপ্লিকেট রো হয় না | `UNIQUE(month_id, member_id, day)` + upsert |
| ভ্যালিডেশন: ০ ≤ meals ≤ 100, NaN রিজেক্ট | `mess/route.ts` |
| দৈনিক/মাসিক মোট লাইভ | `views/MealsView.tsx` ফুটার + `lib/calc.ts` (`buildMealMatrix()`, `dayTotals()`) |
| এডিট/ডিলিট টেবিল | `views/EntriesTable.tsx` |

---

## 6 · Bazar / Market expense (spec §19)

| ফিচার | কোথায় |
|---|---|
| এন্ট্রি ফর্ম (তারিখ, বায়ার, ক্যাটাগরি, আইটেম, পরিমাণ, নোট) | `views/BazarView.tsx` + `ui/entry-panel.tsx` |
| ৮টি ক্যাটাগরি (Groceries…Other) | `bazar_category` enum |
| তারিখ অবশ্যই মাসের ভেতরে | `assertDateInMonth()` |
| পরিমাণ > 0, numeric | `lib/validate.ts` |
| ফিল্টার (তারিখ রেঞ্জ/ক্যাটাগরি), সর্ট, মোট | `views/BazarView.tsx` |
| এডিট/ডিলিট (অফিস+মাস স্কোপড) | `updateBazar()`, `deleteBazar()` |
| মিল রেটে প্রভাব | `calc.ts` → `totalBazar` (+ `bazarByCategory()`, `bazarByBuyer()`) |

---

## 7 · Member fund / deposit (spec §21, §121-1/2)

| ফিচার | কোথায় |
|---|---|
| জমা এন্ট্রি (তারিখ, সদস্য, পরিমাণ, টাইপ, নোট) | `views/FundView.tsx` |
| **স্থায়ী তহবিল** (`permanent_fund`) আলাদা টাইপ | `deposits.type` |
| সদস্য-ভিত্তিক মোট জমা | `lib/calc.ts` → `calculateMonth()` |
| রিপোর্টে PermanentFund আলাদা কলাম | `report-csv.ts`, `report-pdf.ts`, sheet `07_দেনা_পাওনা` |
| **মিল চার্জ থেকে কাটা হয় না** | `calc.ts` → `totalCost` (E2E asserted) |
| দেনা-পাওনায় ব্যবহৃত | `calc.ts` → `denaPoana = deposit − totalCost` |

---

## 8 · Other income (spec §23)

`views/IncomeView.tsx` → `other_incomes` → `lib/calc.ts` `calculateMonth()` এ `NetMealCost = TotalBazar − OtherIncome`।

---

## 9 · Extra expense — shared / individual (spec §25, §121-4/5)

| ফিচার | কোথায় |
|---|---|
| দুই টাইপের ফর্ম (টগল) | `views/ExtrasView.tsx` |
| `individual` হলে সদস্য বাধ্যতামূলক | `createExtra()` → ValidationError |
| shared = সক্রিয় সদস্যদের সমান ভাগ | `calc.ts` `calculateMonth()` → `sharedExtra = totalSharedExtra / activeMembers` |
| individual = শুধু ওই সদস্যের খরচে যোগ | `calc.ts` → `memberCalculations[].individualExtra` |
| নিষ্ক্রিয় সদস্য shared ভাগ পায় না | `members.is_active` ফিল্টার |
| টাইপ ব্যাজ + ফিল্টার | `views/ExtrasView.tsx` |

---

## 10 · Member management (spec §27)

| ফিচার | কোথায় |
|---|---|
| সদস্য যোগ/সম্পাদনা/ডিলিট | `views/MembersView.tsx` |
| সক্রিয়/নিষ্ক্রিয় টগল | `member.update` → `isActive` |
| রুম, ফোন, নোট, ইন-মেস রোল | `members` টেবিল |
| মাস-ভিত্তিক রোস্টার | `UNIQUE(month_id, phone)` |
| জয়েনার অনুমোদন প্যানেল | `views/MembersView.tsx` (`members.approve`) |
| ব্যালেন্স ক্যারি / নোট | `mess_months.carry_forward_balance` |
| সদস্যের নিজের রিপোর্ট (নিজের সারি মাত্র) | `scopeCalcs()` |

---

## 11 · Monthly report + Dena-Paona (spec §29–33)

| ফিচার | কোথায় |
|---|---|
| KPI কার্ড (মোট মিল, মিল রেট, বাজার, আয়, তহবিল) | `views/ReportView.tsx` |
| সদস্য-ভিত্তিক টেবিল (মিল, মিল খরচ, একক/যৌথ অতিরিক্ত, মোট খরচ, জমা, তহবিল, দেনা-পাওনা, স্ট্যাটাস) | `views/ReportView.tsx` + `views/EntriesTable.tsx` |
| তারিখ রেঞ্জ রিপোর্ট | `report.summary` (`fromDate`, `toDate`) |
| দিবে / পাবে / সমান | `calc.ts` → `status: "due" \| "receive" \| "settled"` |
| মাস বন্ধ করা (রিপোর্ট থেকেই) | `views/ReportView.tsx` → `month.close` |
| CSV এক্সপোর্ট (৭টি ভ্যারিয়েন্ট) | `lib/report-csv.ts` → `api/report/export/route.ts` |
| PDF (A4 প্রিন্ট-রেডি বাংলা) | `lib/report-pdf.ts`, `app/report/print/page.tsx` |
| প্রিন্ট ভিউ | `/report/print` + `@page A4` CSS |

সূত্র (অপরিবর্তনীয়):

```
NetMealCost   = TotalBazar − OtherIncome
MealRate      = NetMealCost ÷ TotalMeals
MealCost      = TotalMeals × MealRate
SharedExtra   = TotalSharedExtra ÷ ActiveMembers
TotalCost     = MealCost + IndividualExtra + SharedExtra      (Fund বাদ)
DenaPoana     = TotalDeposit − TotalCost
```

---

## 12 · Google Sheet view + sync (spec §35–60, §65)

| ফিচার | কোথায় |
|---|---|
| ৮টি বাংলা ট্যাবের সংজ্ঞা ও হেডার | `lib/sheet-structure.ts` (`SHEET_TABS`, `COLUMNS`, `OFFICE_INFO_KEYS`) |
| পে-লোড বিল্ডার | `lib/sheets.ts` → `buildSyncPayload()` |
| শিট প্রিভিউ (ট্যাব-ভিত্তিক টেবিল) | `views/SheetView.tsx` |
| সিঙ্ক বাটন + পিং + লগ ভিউ | `views/SheetView.tsx` |
| Apps Script কল (timeout, retry-safe) | `lib/sheets.ts` → `callScript()` |
| সিঙ্ক লগ (সফল/ব্যর্থ দুটোই) | `sync_logs` টেবিল + `listSyncLogs()` |
| অটো-সিঙ্ক (`AUTO_SYNC=1`) | `components/app-context.tsx` |
| অফিস-ভিত্তিক স্ক্রিপ্ট URL সেভ | `office.updateSettings` → `offices.script_url` |
| **Apps Script কোড (সম্পূর্ণ)** | `google-apps-script/Code.gs`, `appsscript.json` |
| ফুল রাইট (clear → headers → rows → freeze) | `Code.gs` → `doSync()` / `writeSheet()` |
| pushRows / replaceSheet / upsertById / deleteById / pull / ping | `Code.gs` |
| শিট ব্যর্থ হলেও DB নিরাপদ | `runFullSync()` — ডেটা আগে কমিট, সিঙ্ক পরে; ফলাফল শুধু লগ হয় |
| সংখ্যা vs টেক্সট টাইপ (ID/Phone টেক্সট) | `Code.gs` → `normalizeTypes()`, `TEXT_COLUMNS`, `NUMERIC_COLUMNS` |
| সেটআপ গাইড | `docs/google-apps-script.md` |

---

## 13 · Admin panel (spec §62–66)

| ফিচার | কোথায় |
|---|---|
| প্ল্যাটফর্ম সামারি (অফিস/ইউজার/মাস/পেন্ডিং কাউন্ট) | `views/AdminView.tsx` → `admin.summary` |
| অফিস লিস্ট + সার্চ + ফিল্টার | `views/AdminView.tsx` (OfficesPanel) |
| অফিস তৈরি/সম্পাদনা/স্ট্যাটাস/ডিলিট (টাইপ-কনফার্ম) | `admin.office.*` |
| অফিস সুইচার (হেডারে) | `MessApp.tsx` → `office.switch` |
| ইউজার লিস্ট (অফিস/রোল/স্ট্যাটাস ফিল্টার) | `views/AdminView.tsx` (UsersPanel) |
| ইউজার তৈরি/সম্পাদনা/রোল/স্ট্যাটাস | `admin.user.*` |
| পাসওয়ার্ড রিসেট | `admin.user.resetPassword` |
| ইউজার ডিলিট (সেশনসহ) | `admin.user.delete` |
| পেন্ডিং জয়েনার কিউ | `admin.pendingUsers` |
| অডিট লগ ভিউয়ার (ফিল্টার + স্কোপ=all) | `views/AdminView.tsx` → `audit.list` |
| প্রোডাকশনে পাসওয়ার্ড দেখানো হয় না | `SHOW_PASSWORDS_IN_ADMIN` গার্ড |

---

## 14 · UI / UX (spec §67–75)

| ফিচার | কোথায় |
|---|---|
| মোবাইল-ফার্স্ট রেসপন্সিভ লেআউট | `components/MessApp.tsx`, `app/globals.css` |
| সাইডবার (ডেস্কটপ) + বটম/ড্রয়ার নেভ (মোবাইল) | `MessApp.tsx` |
| ডার্ক/লাইট থিম (localStorage + inline script, কোনো ঝলকানি নয়) | `app/layout.tsx`, `globals.css` (`--brand` টোকেন) |
| বাংলা UI + বাংলা সংখ্যা ফরম্যাট | `lib/format.ts` |
| লোডিং স্কেলিটন / স্পিনার | `app/loading.tsx`, `ui/index.tsx` |
| খালি অবস্থার বার্তা (empty state) | প্রতিটি view |
| টোস্ট নোটিফিকেশন (সফল/ব্যর্থ) | `components/app-context.tsx` |
| গ্লোবাল এরর বাউন্ডারি (কোনো ব্ল্যাঙ্ক স্ক্রিন নয়) | `app/error.tsx`, `app/global-error.tsx` |
| কনফার্মেশন ডায়ালগ (ডিলিট/মাস বন্ধ) | `ui/index.tsx` → `ConfirmDialog` |
| মোডাল ফর্ম | `ui/index.tsx` → `Modal` |
| সার্চ/ফিল্টার/সর্ট টেবিল | `views/EntriesTable.tsx` |
| প্রিন্ট-বান্ধব রিপোর্ট | `app/report/print/page.tsx` |
| ডিজাইন প্রিমিটিভ (Button, Input, Select, Card, KPI, Badge…) | `components/ui/index.tsx` |
| রিইউজেবল এন্ট্রি প্যানেল | `components/ui/entry-panel.tsx` |

---

## 15 · Data export (spec §42–43)

| ফরম্যাট | এন্ডপয়েন্ট | লাইব্রেরি |
|---|---|---|
| CSV (UTF-8 BOM, Excel-এ বাংলা ঠিক) | `GET /api/report/export?format=csv&variant=…` | `lib/report-csv.ts` |
| প্রিন্ট-রেডি HTML → PDF (browser Print) | `GET /api/report/export?format=html` | `lib/report-pdf.ts` |
| PDF (inline প্রিন্ট ডায়ালগ) | `GET /api/report/pdf` | `lib/report-pdf.ts` |
| Google Sheet (৮ ট্যাব) | `POST /api/sync` + Apps Script | `lib/sheets.ts` |

CSV ভ্যারিয়েন্ট: `full`, `members`, `meals`, `bazar`, `deposits`, `incomes`, `extras`।

---

## 16 · Security hardening

| বিষয় | ইমপ্লিমেন্টেশন |
|---|---|
| পাসওয়ার্ড হ্যাশ | `bcryptjs` cost 10 (`lib/password.ts`) |
| সেশন টোকেন | `crypto.randomBytes(32).toString("base64url")` (`lib/random.ts`) |
| Cookie ফ্ল্যাগ | HttpOnly, Path=/, SameSite=Lax, Secure (prod) |
| SQL ইনজেকশন | Drizzle parameterized queries (E2E টেস্টে যাচাই করা) |
| XSS | React escaping; `dangerouslySetInnerHTML` ব্যবহৃত হয় মাত্র ২ জায়গায় — (ক) `layout.tsx`-এ থিম ইনলাইন স্ক্রিপ্ট (কনস্ট্যান্ট টেক্সট), (খ) `report/print/page.tsx`-এ নিজের জেনারেট করা প্রিন্ট রিপোর্ট, যার প্রতিটি ডাইনামিক মান `esc()` দিয়ে HTML-escaped (`lib/report-pdf.ts`) |
| রেট লিমিট | `lib/rate-limit.ts` (লগইন/সাইনআপ/জয়েন/রাইট/সিঙ্ক/এক্সপোর্ট) |
| অফিস স্কোপিং | প্রতিটি কুয়েরিতে `officeId` |
| ক্লোজড মাস | `assertWritable()` |
| পেন্ডিং ইউজার | read-only |
| সার্ভার-সাইড ভ্যালিডেশন | `lib/validate.ts` (ক্লায়েন্ট ভ্যালিডেশন শুধু UX-এর জন্য) |
| অডিট ট্রেইল | `lib/audit.ts` → `audit_logs` (সফল ও ব্যর্থ দুটোই) |
| এরর লিক | প্রোডাকশনে স্ট্যাক ট্রেস ক্লায়েন্টে যায় না (`lib/api.ts` → `handleError`) |

---

## 17 · Testing

| টেস্ট | কমান্ড | কভারেজ |
|---|---|---|
| টাইপচেক | `npm run typecheck` | 0 error |
| প্রোডাকশন বিল্ড | `npm run build` | সব রুট কম্পাইল |
| E2E API | `npm run test:api` | **১৪১টি চেক** — অথ, রোল, অফিস/মাস আইসোলেশন, CRUD, হিসাবের সূত্র, ক্লোজড মাস, এক্সপোর্ট, সিঙ্ক, সাইনআপ/জয়েন/অ্যাপ্রুভাল, অ্যাডমিন, লগআউট, ইনজেকশন |
| Apps Script সিমুলেশন | `npm run test:sheet` | **৭০টি চেক** — আসল `Code.gs` + আসল পে-লোড: ট্যাবের নাম/ক্রম/হেডার, সেল টাইপ, আইডেমপোটেন্সি, pull/push/upsert/delete, এরর হ্যান্ডলিং, টোকেন |

টেস্ট রানার দুটোই শুধু Node ব্যবহার করে (কোনো এক্সট্রা ডিপেন্ডেন্সি নেই)।
