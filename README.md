# 🍚 Mess Meal Manager — Multi-Office / Multi-Mess

একটি সম্পূর্ণ প্রোডাকশন-রেডি **মেস মিল ম্যানেজমেন্ট সিস্টেম**। একটি ইউনিভার্সাল URL-এ যত খুশি অফিস/মেস চলবে — প্রতিটি অফিসের নিজস্ব ম্যানেজার, সদস্য, মাস, মিল, বাজার, ফান্ড, আয়, খরচ ও রিপোর্ট থাকবে, এবং ডেটা কখনোই এক অফিস থেকে অন্য অফিসে মিশবে না। শুধু **প্ল্যাটফর্ম অ্যাডমিন** সব অফিস দেখতে পাবেন।

> **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · PostgreSQL · Drizzle ORM · Google Apps Script
> **ভাষা:** UI, রিপোর্ট, শিট ট্যাব ও এরর মেসেজ — সব বাংলা। কোড ও DB কলাম — ইংরেজি।

---

## সূচি

1. [ফিচার লিস্ট](#১--ফিচার-লিস্ট)
2. [৫ মিনিটে চালু করা (Quick start)](#২--৫-মিনিটে-চালু-করা)
3. [ডেমো লগইন](#৩--ডেমো-লগইন)
4. [রোল ও পারমিশন](#৪--রোল-ও-পারমিশন)
5. [হিসাবের নিয়ম (অপরিবর্তনীয়)](#৫--হিসাবের-নিয়ম-অপরিবর্তনীয়)
6. [প্রজেক্ট স্ট্রাকচার](#৬--প্রজেক্ট-স্ট্রাকচার)
7. [টেস্ট](#৭--টেস্ট)
8. [ডকুমেন্টেশন](#৮--ডকুমেন্টেশন)

---

## ১ · ফিচার লিস্ট

| # | ফিচার | কোথায় | স্ট্যাটাস |
|---|-------|--------|-----------|
| 1 | লগইন (ইউজার আইডি/ফোন + পাসওয়ার্ড, bcrypt hash) | `/login` | ✅ |
| 2 | অফিস সাইনআপ (নতুন মেস খোলা — অটো অফিস কোড + চলতি মাস) | `/signup` | ✅ |
| 3 | মেম্বার জয়েন (অফিস কোড দিয়ে আবেদন → ম্যানেজারের অনুমোদন) | `/join` | ✅ |
| 4 | ড্যাশবোর্ড (KPI, আজকের মিল, সাম্প্রতিক বাজার, দ্রুত লিংক) | ড্যাশবোর্ড ট্যাব | ✅ |
| 5 | দৈনিক মিল এন্ট্রি (দশমিক মিল — ০.৫, ১.৫; দিন ও মাস-গ্রিড দুই মোড) | দৈনিক মিল ট্যাব | ✅ |
| 6 | বাজার / মার্কেট খরচ (তারিখ, আইটেম, ক্যাটাগরি, বায়ার, পরিমাণ) | বাজার ট্যাব | ✅ |
| 7 | মেম্বার ফান্ড / জমা (**স্থায়ী তহবিল**, মাসিক চার্জ থেকে কাটা হয় না) | ফান্ড ট্যাব | ✅ |
| 8 | অন্যান্য আয় (মিল রেট কমাতে ব্যবহৃত হয়) | আয় ট্যাব | ✅ |
| 9 | অতিরিক্ত খরচ — **Shared** (সবার সমান ভাগ) ও **Individual** (শুধু নির্দিষ্ট সদস্য) | অতিরিক্ত খরচ ট্যাব | ✅ |
| 10 | মেম্বার ম্যানেজমেন্ট (যোগ/সম্পাদনা/সক্রিয়-নিষ্ক্রিয়/ব্যালেন্স ক্যারি) | সদস্য ট্যাব | ✅ |
| 11 | মাসিক রিপোর্ট (মিল রেট, খরচ, দেনা-পাওনা, দিবে/পাবে/সমান) | হিসাব ট্যাব | ✅ |
| 12 | দেনা-পাওনা (Deposit − Total Cost, Permanent Fund আলাদা কলাম) | রিপোর্ট + শিট | ✅ |
| 13 | গুগল শিট ভিউ (৮টি বাংলা ট্যাবের লাইভ প্রিভিউ + পে-লোড কপি) | গুগল শিট ট্যাব | ✅ |
| 14 | গুগল শিট সিঙ্ক (Apps Script দিয়ে ফুল রাইট; সিঙ্ক ফেল করলেও DB ডেটা নিরাপদ) | গুগল শিট ট্যাব | ✅ |
| 15 | অ্যাডমিন প্যানেল (সব অফিস, সব ইউজার, অফিস সুইচার) | অ্যাডমিন ট্যাব | ✅ |
| 16 | অফিস ম্যানেজমেন্ট (তৈরি/আপডেট/সক্রিয়-নিষ্ক্রিয়/ডিলিট — টাইপ করে কনফার্ম) | অ্যাডমিন ট্যাব | ✅ |
| 17 | ইউজার ম্যানেজমেন্ট (তৈরি/রোল পরিবর্তন/স্ট্যাটাস/পাসওয়ার্ড রিসেট) | অ্যাডমিন ট্যাব | ✅ |
| 18 | রোল ও পারমিশন (admin / manager / member / audit — সার্ভার-সাইড ম্যাট্রিক্স) | সর্বত্র | ✅ |
| 19 | লগআউট (সেশন টেবিলে invalidated) | হেডার | ✅ |
| 20 | CSV এক্সপোর্ট (UTF-8 BOM — Excel-এ বাংলা ঠিক থাকে) | রিপোর্ট ট্যাব | ✅ |
| 21 | PDF এক্সপোর্ট (A4 প্রিন্ট-রেডি বাংলা রিপোর্ট → Save as PDF) | রিপোর্ট ট্যাব | ✅ |
| 22 | মাস আলাদা রাখা (নতুন মাস = নতুন monthId, মিল ০, সদস্য তালিকা কপি) | মাস সিলেক্টর | ✅ |
| 23 | পুরনো মাস ভিউ (closed মাস read-only, ডেটা মুছে যায় না) | মাস সিলেক্টর | ✅ |
| 24 | অডিট লগ (কে, কখন, কী করল — read-only) | অ্যাডমিন ট্যাব | ✅ |
| 25 | ডার্ক/লাইট থিম + মোবাইল-ফার্স্ট রেসপন্সিভ UI | সর্বত্র | ✅ |

**নিরাপত্তা:** bcrypt পাসওয়ার্ড হ্যাশ · HTTP-only cookie সেশন (DB `sessions` টেবিল) · প্রতিটি API-তে রোল + অফিস + মাস ভ্যালিডেশন · অফিস আইসোলেশন DB/API লেভেলে (`officeId` ফিল্টার) · রেট লিমিট · SQL ইনজেকশন-নিরাপদ (Drizzle parameterized queries) · প্রোডাকশনে অ্যাডমিন প্যানেলে পাসওয়ার্ড দেখানো হয় না।

---

## ২ · ৫ মিনিটে চালু করা

**প্রয়োজন:** Node.js ≥ 20.9, PostgreSQL ≥ 14

```bash
# 1) কোড ক্লোন/কপি করে ডিপেন্ডেন্সি ইনস্টল
cd mess-meal-manager
npm install

# 2) PostgreSQL-এ ডেটাবেস তৈরি
sudo -u postgres psql -c "CREATE USER messapp WITH PASSWORD 'messapp' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE mess_manager OWNER messapp;"

# 3) এনভায়রনমেন্ট কনফিগ
cp .env.example .env.local
nano .env.local        # DATABASE_URL + SESSION_SECRET ঠিক করুন
#   SESSION_SECRET তৈরি: openssl rand -hex 32

# 4) টেবিল তৈরি + ডেমো ডেটা
npm run db:migrate:sql # drizzle/0000_init.sql প্রয়োগ (idempotent)
npm run db:seed        # (ডেভে: npm run db:push ও চলবে)

# 5) প্রোডাকশন বিল্ড + সার্ভার
npm run build
npm run start          # http://localhost:3000
```

ডেভেলপমেন্ট মোডে: `npm run dev`

**ক্লাউডে (ফ্রি) ডিপ্লয় করতে চান?** → [`docs/vercel-neon.md`](docs/vercel-neon.md)
Neon-এর URL দিলেই অ্যাপ স্বয়ংক্রিয়ভাবে serverless ড্রাইভারে চলে যায়:

```bash
DATABASE_URL="postgresql://…-pooler.…neon.tech/neondb?sslmode=require" npm run db:migrate:remote
```

> সব স্ক্রিপ্ট: `dev`, `build`, `start`, `typecheck`, `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:seed`, `db:reset`, `test`, `test:api`, `test:sheet`

---

## ৩ · ডেমো লগইন

`npm run db:seed` এই ডেটা তৈরি করে (৩টি অফিস, ৯ জন ইউজার, ৬টি মাস, ২৬ জন সদস্য, ৪৯৫টি মিল এন্ট্রি, ৬৯টি বাজার এন্ট্রি):

| রোল | ইউজার আইডি | পাসওয়ার্ড | কী দেখবেন |
|------|-------------|-----------|------------|
| **প্ল্যাটফর্ম অ্যাডমিন** | `01700000000` | `admin` | সব অফিস + অ্যাডমিন প্যানেল |
| **ম্যানেজার** (Gobra Mess) | `01711111111` | `manager123` | শুধু নিজের অফিস, সব ট্যাব |
| **সদস্য** (Gobra Mess) | `01722222222` | `member123` | শুধু নিজের রিপোর্ট |
| **অডিট** (Gobra Mess) | `01733333333` | `audit123` | সব read-only + অডিট লগ |
| **পেন্ডিং জয়েনার** | `01799999999` | `member123` | লগইন হবে, অনুমোদনের অপেক্ষায় |
| **ম্যানেজার** (Barishal) | `01911111111` | `manager123` | অন্য অফিস (আইসোলেশন টেস্ট) |

অফিস কোড (মেম্বার জয়েনের জন্য): **GOBRA01**, **BARISHAL01**, **DHAKA01**

> ⚠️ প্রোডাকশনে নেওয়ার আগে এই পাসওয়ার্ডগুলো অবশ্যই বদলে দিন।

---

## ৪ · রোল ও পারমিশন

প্রতিটি রি퀘স্টে সার্ভার-সাইডে চেক হয়: **session → user → role → office → month → permission → database**

| Capability | Admin | Manager | Member | Audit |
|---|:---:|:---:|:---:|:---:|
| dashboard.view | ✅ | ✅ | ❌ | ✅ |
| meals.view / meals.write | ✅ | ✅ | ❌ | ✅ / ❌ |
| bazar.view / bazar.write | ✅ | ✅ | ❌ | ✅ / ❌ |
| fund.view / fund.write | ✅ | ✅ | ❌ | ✅ / ❌ |
| income.view / income.write | ✅ | ✅ | ❌ | ✅ / ❌ |
| extras.view / extras.write | ✅ | ✅ | ❌ | ✅ / ❌ |
| members.view / members.write | ✅ | ✅ | ❌ | ✅ / ❌ |
| members.approve (জয়েনার অনুমোদন) | ✅ | ✅ | ❌ | ❌ |
| report.view / report.export | ✅ | ✅ | ✅ (শুধু নিজের সারি) | ✅ |
| sheet.view / sheet.sync | ✅ | ✅ | ❌ | ✅ / ❌ |
| month.write (নতুন মাস/ক্লোজ) | ✅ | ✅ | ❌ | ❌ |
| settings.write (অফিস সেটিংস) | ✅ | ✅ | ❌ | ❌ |
| office.manage / user.manage | ✅ | ❌ | ❌ | ❌ |
| audit.view | ✅ | ❌ | ❌ | ✅ |

**ডিফল্ট হোম ট্যাব:** admin → ড্যাশবোর্ড · manager → দৈনিক মিল · member → হিসাব · audit → হিসাব

**আইসোলেশন গ্যারান্টি:**
- ম্যানেজার অন্য অফিসের `monthId` পাঠালে → **403**
- সদস্য `meals.list` / `bazar.create` / `month.data` কল করলে → **403**
- সদস্যের রিপোর্টে শুধু নিজের সারি (`selfOnly: true`)
- অ্যাডমিন ছাড়া কেউ `office.switch` করতে পারে না

---

## ৫ · হিসাবের নিয়ম (অপরিবর্তনীয়)

এই ৮টি নিয়ম কোডে হার্ড-কোড করা এবং টেস্ট দিয়ে যাচাই করা। কোনোদিন বদলানো যাবে না:

1. **স্থায়ী তহবিল (Permanent Fund) সম্পূর্ণ আলাদা** — মাসিক হিসাবের বাইরে।
2. **ফান্ড মাসিক মিল চার্জ থেকে কাটা হয় না।**
3. **মিল রেট = (মোট বাজার − অন্যান্য আয়) ÷ মোট মিল**
   ```
   NetMealCost = TotalBazar − OtherIncome
   MealRate    = NetMealCost ÷ TotalMeals
   ```
4. **Individual অতিরিক্ত খরচ শুধু নির্দিষ্ট সদস্যের ঘাড়ে।**
5. **Shared অতিরিক্ত খরচ সক্রিয় সদস্যদের মধ্যে সমান ভাগ।**
   ```
   MemberTotalCost = MealCost + IndividualExtra + SharedExtraPerMember
   MealCost        = TotalMeals × MealRate
   SharedExtraPerMember = TotalSharedExtra ÷ ActiveMembers
   ```
6. **প্রতিটি অফিসের ডেটা আলাদা** (`officeId` ফিল্টার)।
7. **প্রতিটি মাসের ডেটা আলাদা** (`monthId = officeId-YYYY-MM`)।
8. **পুরনো মাস দেখা যাবে** — নতুন মাসে মিল ০ থেকে শুরু, সদস্য তালিকা কপি করা যায়।

**দেনা-পাওনা:**
```
DenaPoana = TotalDeposit − TotalCost
DenaPoana > 0  → পাবে (Receive)
DenaPoana < 0  → দিবে (Due)
DenaPoana = 0  → সমান (Settled)
```

---

## ৬ · প্রজেক্ট স্ট্রাকচার

```
mess-meal-manager/
├─ src/
│  ├─ app/
│  │  ├─ api/
│  │  │  ├─ auth/{login,logout,me,signup,join}/route.ts   ← সেশন + রেজিস্ট্রেশন
│  │  │  ├─ health/route.ts                              ← ডেটাবেস/টাইমজোন চেক
│  │  │  ├─ migrations/route.ts                          ← ★ এক-শট স্কিমা সেটআপ (Vercel+Neon)
│  │  │  ├─ setup/status/route.ts                        ← ডিপ্লয়মেন্ট রেডিনেস প্রোব
│  │  │  └─ dev/reset-rate-limits/route.ts               ← লিমিটার রিসেট (অ্যাডমিন/সিক্রেট)
│  │  │  ├─ mess/route.ts                                ← ★ মূল API হাব (৫৪টি action)
│  │  │  ├─ sync/route.ts                                ← গুগল শিট সিঙ্ক
│  │  │  └─ report/{export,pdf}/route.ts                 ← CSV / প্রিন্ট-রেডি PDF
│  │  ├─ {login,signup,join}/page.tsx                     ← অথেন্টিকেশন পেজ
│  │  ├─ report/print/page.tsx                            ← A4 প্রিন্ট ভিউ
│  │  ├─ page.tsx                                         ← অ্যাপ শেল (?tab=…)
│  │  ├─ error.tsx / global-error.tsx / loading.tsx       ← কোনো ব্ল্যাঙ্ক স্ক্রিন নয়
│  │  └─ layout.tsx / globals.css
│  ├─ components/
│  │  ├─ app-context.tsx                                  ← স্টেট, বুটস্ট্র্যাপ, অটো-সিঙ্ক
│  │  ├─ MessApp.tsx                                      ← শেল, নেভিগেশন, অফিস/মাস সুইচার
│  │  ├─ ui/{index.tsx,entry-panel.tsx}                   ← ডিজাইন প্রিমিটিভ
│  │  └─ views/                                           ← ১২টি স্ক্রিন (সব ফিচার)
│  ├─ db/{schema.ts,index.ts}                             ← Drizzle স্কিমা + কানেকশন (pg / Neon অটো)
│  └─ lib/
│     ├─ permissions.ts   ← ★ রোল ম্যাট্রিক্স + মেনু
│     ├─ mess-data.ts     ← ★ সব DB রিড/রাইট (অফিস+মাস স্কোপড)
│     ├─ calc.ts          ← ★ মিল রেট / খরচ / দেনা-পাওনা
│     ├─ sheets.ts + sheet-structure.ts  ← ৮ ট্যাবের শিট পে-লোড
│     ├─ migrate.ts       ← ★ রানটাইম SQL মাইগ্রেশন রানার (idempotent)
│     ├─ api.ts           ← সেশন, পারমিশন, রেট-লিমিট, এরর হ্যান্ডলার
│     ├─ auth.ts password.ts audit.ts rate-limit.ts
│     ├─ date.ts format.ts validate.ts random.ts types.ts
│     └─ report-csv.ts report-pdf.ts client.ts service.ts
├─ google-apps-script/
│  ├─ Code.gs            ← ★ শিট সিঙ্ক এন্ডপয়েন্ট (সম্পূর্ণ কোড)
│  └─ appsscript.json
├─ scripts/
│  ├─ seed.ts            ← ডেমো ডেটা (idempotent)
│  ├─ reset.ts           ← সব টেবিল ড্রপ
│  ├─ migrate.ts         ← রিমোট (Neon) মাইগ্রেশন CLI
│  ├─ test-setup.mjs     ← টেস্টের আগে ডেমো DB রিস্টোর (গার্ডেড)
│  ├─ test-api.mjs       ← ১৫৪টি E2E API চেক
│  └─ test-apps-script.mjs ← ৭০টি Apps Script সিмуляশন চেক
├─ drizzle/0000_init.sql ← মাইগ্রেশন
├─ vercel.json           ← Vercel কনফিগ (region sin1, maxDuration)
├─ docs/                 ← ডিপ্লয়মেন্ট, Apps Script, API, DB ডক
└─ .env.example
```

---

## ৭ · টেস্ট

```bash
npm run build        # TypeScript 0 error + প্রোডাকশন বিল্ড
npm run test:api     # ১৫৪টি E2E চেক (অথ, আইসোলেশন, হিসাব, এক্সপোর্ট, সিঙ্ক…)
npm run test:sheet   # ৭০টি চেক — আসল Code.gs + আসল পে-লোড দিয়ে সিমুলেশন
npm run test         # দুটোই (প্রথমে ডেমো DB রিস্টোর করে, তাই বারবার চালানো যায়)
```

`test:sheet` আসল `google-apps-script/Code.gs` ফাইলটাই লোড করে, অ্যাপের কাছ থেকে আসল `sheet.payload` নিয়ে, একটি সিমুলেটেড SpreadsheetApp-এ চালায় — ফলে ট্যাবের নাম, হেডার, সারি সংখ্যা ও সেল টাইপ হুবহু যাচাই হয় (গুগল শিটে ডিপ্লয় করার আগেই)।

---

## ৮ · ডকুমেন্টেশন

| ফাইল | বিষয় |
|------|-------|
| [`docs/vercel-neon.md`](docs/vercel-neon.md) | ★ **Vercel + Neon ফ্রি ডিপ্লয়মেন্ট** — ধাপে ধাপে (GitHub → Neon → মাইগ্রেশন → env → যাচাই) |
| [`docs/deployment.md`](docs/deployment.md) | লোকাল/ভিপিএস/Vercel+Neon/Railway/Docker ডিপ্লয়মেন্ট, এনভি ভেরিয়েবল, ব্যাকআপ, সিকিউরিটি চেকলিস্ট |
| [`docs/google-apps-script.md`](docs/google-apps-script.md) | শিট তৈরি → Apps Script → Web App ডিপ্লয় → অ্যাপে URL বসানো (স্ক্রিনশট-স্টাইল ধাপ) |
| [`docs/api.md`](docs/api.md) | প্রতিটি এন্ডপয়েন্ট ও ৫২টি action-এর রিকোয়েস্ট/রেসপন্স উদাহরণ |
| [`docs/database.md`](docs/database.md) | টেবিল, কলাম, ইউনিক কনস্ট্রেইন্ট, ইনডেক্স ও বিজনেস রুল ম্যাপিং |
| [`docs/features.md`](docs/features.md) | স্পেকের প্রতিটি ফিচার কোথায় ইমপ্লিমেন্ট হয়েছে তার ম্যাপ |

---

### লাইসেন্স

নিজের ব্যবহারের জন্য তৈরি — অফিস/মেস ম্যানেজমেন্টের কাজে মুক্তভাবে ব্যবহার ও পরিবর্তন করতে পারেন।
