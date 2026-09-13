# Vercel + Neon ডিপ্লয়মেন্ট গাইড (ফ্রি টিয়ার)

**সময়:** ~১৫ মিনিট · **খরচ:** ৳০ (Vercel Hobby + Neon Free দুটোই ফ্রি)
**ফলাফল:** `https://আপনার-প্রজেক্ট.vercel.app` — পৃথিবীর যেকোনো জায়গা থেকে আপনার সব অফিস/মেস একই URL-এ চলবে।

> এই প্রজেক্ট আগে থেকেই Vercel+Neon-রেডি করা আছে:
> - `src/db/index.ts` স্বয়ংক্রিয়ভাবে Neon ড্রাইভার বেছে নেয় (হোস্টে `neon.tech` দেখলে)
> - `src/lib/migrate.ts` + `POST /api/migrations` → শেল ছাড়াই স্কিমা তৈরি
> - `GET /api/setup/status` → ডিপ্লয়মেন্ট ঠিক হয়েছে কিনা এক নজরে
> - `vercel.json`, `next.config.ts` (serverExternalPackages + drizzle ফাইল ট্রেসিং) কনফিগার করা

---

## ধাপ ০ · প্রস্তুতি

আপনার কাছে থাকতে হবে:
- [ ] একটি **GitHub** অ্যাকাউন্ট
- [ ] একটি **Vercel** অ্যাকাউন্ট (GitHub দিয়েই লগইন করা যাবে)
- [ ] একটি **Neon** অ্যাকাউন্ট (GitHub দিয়েই লগইন করা যাবে)
- [ ] প্রজেক্ট ফোল্ডার (`mess-meal-manager/`) — এই workspace থেকে ডাউনলোড করুন, অথবা `git clone`

---

## ধাপ ১ · কোড GitHub-এ push করা

টার্মিনালে প্রজেক্ট ফোল্ডারে গিয়ে:

```bash
cd mess-meal-manager

# রিপো ইতিমধ্যে তৈরি (কমিট সহ)। শুধু GitHub রিমোট যোগ করুন:
git remote add origin https://github.com/<আপনার-ইউজারনাম>/mess-meal-manager.git
git branch -M main
git push -u origin main
```

রিপো একদম নতুন করে বানাতে চাইলে:

```bash
cd mess-meal-manager
git init -b main
git add -A
git commit -m "Mess Meal Manager"
git remote add origin https://github.com/<আপনার-ইউজারনাম>/mess-meal-manager.git
git push -u origin main
```

> 🔒 **গুরুত্বপূর্ণ:** `.env.local` কখনো পুশ হবে না (`.gitignore`-এ আছে)। পুশ করার আগে একবার যাচাই করুন:
> ```bash
> git ls-files | grep -i "\.env" || echo "✓ কোনো .env ফাইল নেই"
> ```
> শুধু `.env.example` (খালি টেমপ্লেট) থাকা উচিত।

---

## ধাপ ২ · Neon ডেটাবেস তৈরি (৩ মিনিট)

1. [console.neon.tech](https://console.neon.tech) → **Sign up with GitHub**
2. **Create Project**
   - Project name: `mess-meal-manager`
   - Region: **AWS US East — `iad1` / `aws-us-east-2`** ← Vercel Hobby-এর ফাংশন সবসময় `iad1`-এ চলে,
     তাই ডেটাবেসও সেখানে রাখলে সবচেয়ে দ্রুত হয় (মাপা ফলাফল নিচে)।
     তালিকায় US East না থাকলে `AWS Frankfurt (eu-central-1)` নিন।

> **⚠️ Region নিয়ে সাধারণ ভুল:** "বাংলাদেশ থেকে কাছে" ভেবে Singapore/India নেবেন না।
> ব্রাউজার কখনো সরাসরি ডেটাবেসে কথা বলে না — ব্রাউজার কথা বলে **Vercel ফাংশনের** সাথে, আর
> ফাংশন কথা বলে ডেটাবেসের সাথে। তাই হিসাবটা হলো:
>
> | Neon region | ফাংশন→DB প্রতি কুয়েরি | বাস্তব API কল (মাপা) | মাইগ্রেশন (৫১টি স্টেটমেন্ট) |
> |---|---|---|---|
> | `ap-southeast-1` (Singapore) + Vercel `iad1` | ~340 ms | median **1.77 s** · signup 3.9 s | 17.3 s |
> | `iad1` / US East + Vercel `iad1` | ~1–5 ms | median **~0.3–0.5 s** (প্রত্যাশিত) | ~1–2 s |
>
> অর্থাৎ একই অ্যাপ ৪–৫ গুণ দ্রুত হয় শুধু region ঠিক রাখলে। ইতিমধ্যে Singapore-এ বানিয়ে ফেললে
> নতুন প্রজেক্ট US East-এ বানিয়ে নতুন connection string দিন, তারপর আবার ধাপ ৩–৫ চালান
> (পুরনো ডেটা থাকলে `pg_dump` → নতুন DB-তে রিস্টোর)।
   - Postgres version: সর্বশেষ (16/17)
3. প্রজেক্ট ড্যাশবোর্ডে **Connect** বাটন → Connection Details উইজেট:
   - Branch: `main`
   - Role: `neondb_owner` (ডিফল্ট)
   - Database: `neondb`
   - **Connection pooling: ON** রাখুন ← এটাই serverless-এর জন্য দরকার
4. **Copy** চাপুন — URL টা এমন দেখাবে:

```
postgresql://neondb_owner:AbC123xYz@ep-cool-darkness-a1b2c3d4-pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require
                                                    └──────┬──────┘
                                     হোস্টে "-pooler" থাকাটা বাধ্যতামূলক
```

> ⚠️ `-pooler` ছাড়া URL নিলে Vercel-এ কানেকশন শেষ হয়ে যাবে (`max_connections` error)।
> এই URL-টাই আপনার `DATABASE_URL`। এখন একটা নোটপ্যাডে সেভ করে রাখুন।

---

## ধাপ ৩ · স্কিমা তৈরি (২ মিনিট) — লোকাল থেকে

Neon একদম খালি, তাই টেবিলগুলো তৈরি করতে হবে। সবচেয়ে সহজ উপায় — **আপনার ল্যাপটপ থেকে**:

```bash
cd mess-meal-manager

# খালি DATABASE_URL দিয়ে রান করলে .env.local ওভাররাইড হবে না, তাই এভাবে দিন:
DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-XXXX-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" \
  npm run db:migrate:remote
```

সফল হলে আউটপুট:

```
═══ Mess Meal Manager — SQL migrations ═══
  driver   : neon (serverless websocket)
  database : postgresql://neondb_owner:••••••••@ep-…-pooler…/neondb?sslmode=require
  journal  : 1 migration file(s) → 0000_init

  ✓ applied : 0000_init

  tables    : 14 (__migrations, audit_logs, bazar_expenses, daily_meals, deposits,
                  extra_expenses, members, mess_months, offices, other_incomes,
                  sessions, settings, sync_logs, users)
✓ 1টি মাইগ্রেশন প্রয়োগ হয়েছে (0000_init)
```

### ল্যাপটপ থেকে চালাতে না পারলে → ধাপ ৫-এর "বিকল্প B" দেখুন (ব্রাউজার থেকে)।

### ডেমো ডেটা ঢোকাতে চাইলে (ঐচ্ছিক)

```bash
DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require" npm run db:seed
```

এতে ৩টি ডেমো অফিস + ৯ ইউজার + ৬ মাস + ৪৯৫ মিল এন্ট্রি বসে যাবে (README-তে লগইন তালিকা)।
**আসল ব্যবহারের জন্য ডেমো ডেটা না দেওয়াই ভালো** — তখন প্রথম অফিসটা `/signup` পেজ থেকে খুলবেন।

---

## ধাপ ৪ · Vercel-এ ইমপোর্ট + এনভি ভেরিয়েবল (৪ মিনিট)

1. [vercel.com/new](https://vercel.com/new) → **Sign up with GitHub** → আপনার `mess-meal-manager` রিপো **Import**
2. Framework Preset: **Next.js** (অটো ডিটেক্ট হবে) · Build/Output সেটিংস **ছেড়ে দিন** (ডিফল্টই ঠিক)
3. Deploy করার **আগে** `Environment Variables` সেকশন খুলে এগুলো যোগ করুন:

| Key | Value | Environment |
|---|---|---|
| `DATABASE_URL` | ধাপ ২-এর **pooler** URL (পুরোটা, `?sslmode=require` সহ) | Production, Preview, Development |
| `SESSION_SECRET` | `openssl rand -hex 32` আউটপুট (৬৪ অক্ষর) | Production, Preview, Development |
| `MIGRATION_SECRET` | `openssl rand -hex 24` আউটপুট *(শুধু বিকল্প B ব্যবহার করলে দরকার)* | Production |
| `NODE_ENV` | `production` | Production |
| `GOOGLE_SCRIPT_WEB_APP_URL` | Apps Script `/exec` URL *(শিট সিঙ্ক চাইলে; না হলে খালি)* | Production |
| `AUTO_SYNC` | `0` | Production |
| `SHOW_PASSWORDS_IN_ADMIN` | `0` | Production |

সিক্রেট তৈরি করার এক-লাইনার:

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "MIGRATION_SECRET=$(openssl rand -hex 24)"
```

4. **Deploy** চাপুন → ~১–২ মিনিটে বিল্ড শেষ → 🎉 আপনার লাইভ URL

> Vercel স্বয়ংক্রিয়ভাবে `npm run build` চালায় এবং `vercel.json`-এর রিজিওন (`sin1` = Singapore) ব্যবহার করে।

---

## ধাপ ৫ · ডিপ্লয়মেন্ট যাচাই (১ মিনিট)

ব্রাউজারে খুলুন:

```
https://আপনার-প্রজেক্ট.vercel.app/api/setup/status
```

**সব ঠিক থাকলে:**
```json
{
  "ok": true, "ready": true,
  "database": { "ok": true, "driver": "neon-serverless (websocket)",
                "migrated": true, "tables": 13, "missingTables": [] },
  "counts": { "offices": 3, "users": 9, "months": 6 },
  "nextSteps": ["সব প্রস্তুত — /login থেকে লগইন করুন।"]
}
```

`ready: true` না দেখালে `nextSteps` অ্যারেতেই বাংলায় লেখা থাকবে ঠিক কোন কমান্ড চালাতে হবে।

---

### বিকল্প B · ল্যাপটপ থেকে মাইগ্রেট করা সম্ভব না হলে (ব্রাউজার থেকে)

`MIGRATION_SECRET` Vercel-এ সেট করা থাকলে একবার এই কলটি করলেই স্কিমা তৈরি হয়ে যাবে:

```bash
curl -X POST https://আপনার-প্রজেক্ট.vercel.app/api/migrations \
  -H 'content-type: application/json' \
  -d '{"secret":"আপনার-MIGRATION_SECRET"}'
```

অথবা ব্রাউজারে সরাসরি:
```
https://আপনার-প্রজেক্ট.vercel.app/api/migrations?secret=আপনার-MIGRATION_SECRET
```

রেসপন্স:
```json
{ "ok": true, "applied": ["0000_init"], "skipped": [], "baselined": [],
  "tables": ["audit_logs", "bazar_expenses", "…"], "counts": { "offices": 0, "users": 0, "months": 0 },
  "hint": "স্কিমা প্রস্তুত। এখন GET /api/setup/status দেখুন, তারপর MIGRATION_SECRET মুছে ফেলে আবার ডিপ্লয় দিন।" }
```

> 🔐 **সফল হলে অবশ্যই:** Vercel → Settings → Environment Variables → `MIGRATION_SECRET` **Delete** → Deployments → latest → **Redeploy**।
> (এন্ডপয়েন্টটি তখন 404 দেবে — অর্থাৎ আর কেউ কল করতে পারবে না।)
> এন্ডপয়েন্টটি idempotent, তাই ভুল করে দুইবার চালালেও ক্ষতি নেই।

---

## ধাপ ৬ · প্রথম অফিস খোলা ও ব্যবহার শুরু

**ডেমো ডেট না দিয়ে থাকলে:**
1. `https://আপনার-প্রজেক্ট.vercel.app/signup` খুলুন
2. অফিসের নাম, ব্রাঞ্চ, আপনার ইউজার আইডি (ফোন নম্বর), নাম, পাসওয়ার্ড দিন
3. সাইনআপ → সাথে সাথেই অফিস কোড (যেমন `GOBRA01`) + চলতি মাস তৈরি হয়ে আপনি ম্যানেজার হিসেবে লগইন হয়ে যাবেন
4. সদস্যরা `/join` পেজে ওই অফিস কোড দিয়ে আবেদন করবে → আপনি **সদস্য** ট্যাব থেকে অনুমোদন দেবেন

**ডেমো ডেটা দিয়ে থাকলে:** README-এর লগইন টেবিল ব্যবহার করুন (`01700000000` / `admin`)।

### প্ল্যাটফর্ম অ্যাডমিন তৈরি করা (খালি ডেটাবেস হলে দরকার)

`/signup` দিয়ে খোলা প্রথম ইউজার হয় ওই অফিসের **ম্যানেজার** — সে শুধু নিজের অফিস দেখতে পায়।
একাধিক অফিস দেখা/অফিস ও ইউজার ম্যানেজ করতে **প্ল্যাটফর্ম অ্যাডমিন** লাগে, যেটা খালি ডেটাবেসে
আপনাআপনি তৈরি হয় না। বানানোর উপায়:

```bash
# প্রোডাকশন (Neon) ডেটাবেসে — URL সরাসরি দিয়ে:
DATABASE_URL="postgresql://neondb_owner:…neon.tech/neondb?sslmode=require" \
  npm run admin:create:remote -- --userId=01700000000 --password='আপনার-শক্তিশালী-পাসওয়ার্ড' --name='Platform Admin'

# লোকাল ডেটাবেসে (.env.local থেকে URL নেয়):
npm run admin:create -- --userId=01700000000 --password='আপনার-পাসওয়ার্ড'
```

স্ক্রিপ্টটি idempotent — userId আগে থেকে থাকলে সেটিকে admin/active-এ উন্নীত করে পাসওয়ার্ড নতুন করে
হ্যাশ করে, তাই এটি "অ্যাডমিন পাসওয়ার্ড হারিয়ে গেছে" রিকভারি টুল হিসেবেও কাজ করে।
পাসওয়ার্ড কখনো প্লেইন টেক্সটে সেভ হয় না (bcrypt), আর কমান্ড-লাইন হিস্টোরিতে পাসওয়ার্ড থেকে গেলে
লগইন করে অ্যাপের ভেতর থেকে বদলে নেবেন।

---

## ধাপ ৭ · নিজের ডোমেইন (ঐচ্ছিক)

Vercel → Project → **Settings → Domains** → `mess.আপনারডোমেইন.com` যোগ করুন → আপনার ডোমেইন প্রোভাইডারের DNS-এ Vercel-এর দেখানো রেকর্ড (A/CNAME) বসান → TLS সার্টিফিকেট অটো তৈরি হবে।

কুকি `Secure` + `SameSite=Lax`, তাই HTTPS ডোমেইনে সবকিছু ঠিকঠাক কাজ করবে।

---

## ধাপ ৮ · Google Sheets সিঙ্ক যুক্ত করা (ঐচ্ছিক)

ডিফল্ট URL দিতে চাইলে Vercel-এ `GOOGLE_SCRIPT_WEB_APP_URL` সেট করুন।
তবে **প্রতি অফিসের আলাদা শিট** হওয়াই ভালো — সেক্ষেত্রে env ভেরিয়েবল না দিয়ে অ্যাপের ভেতরেই সেট করুন:

> অ্যাপ → **গুগল শিট** ট্যাব → সেটিংস → `Apps Script Web App URL` → সেভ

Apps Script ডিপ্লয়ের সম্পূর্ণ গাইড: [`google-apps-script.md`](google-apps-script.md)

---

## পরবর্তী আপডেট ডিপ্লয় করা

```bash
git add -A && git commit -m "বিবরণ" && git push
```

Vercel অটো-ডিটেক্ট করে নতুন ডিপ্লয়মেন্ট বানাবে। নতুন মাইগ্রেশন যোগ হলে (`drizzle/*.sql`):

```bash
# লোকাল থেকে
DATABASE_URL="postgresql://…neon.tech/…?sslmode=require" npm run db:migrate:remote
# অথবা ধাপ ৫-এর বিকল্প B (MIGRATION_SECRET আবার সেট করে)
```

নতুন মাইগ্রেশন ফাইল বানাতে স্কিমা বদলে:
```bash
npm run db:generate     # drizzle/000X_নাম.sql তৈরি করে → git commit করুন
```

---

## ব্যাকআপ ও রিস্টোর

Neon ড্যাশবোর্ডে **Branching** ও **Point-in-time restore** ফ্রি টিয়ারেই আছে (২৪ ঘণ্টা হিস্টোরি)।

নিজের ডাম্প নিতে চাইলে (লোকাল থেকে):

```bash
pg_dump "postgresql://…neon.tech/neondb?sslmode=require" -F c -f mess-backup-$(date +%F).dump
# রিস্টোর:
pg_restore -d "postgresql://…neon.tech/neondb?sslmode=require" --clean mess-backup-2026-09-13.dump
```

---

## ট্রাবলশুটিং

| সমস্যা | কারণ | সমাধান |
|---|---|---|
| `/api/setup/status` এ `database.ok: false` | ভুল/পুরনো `DATABASE_URL` | Neon Console থেকে আবার কপি করুন; `-pooler` আছে কিনা দেখুন |
| `max_connections reached` / pool error | non-pooled URL ব্যবহার | `-pooler` সহ URL দিন; `PG_POOL_MAX=3` কমিয়ে দিন |
| `self signed certificate` / TLS error | `?sslmode=require` বাদ পড়েছে | URL-এর শেষে `?sslmode=require` যোগ করুন |
| `/api/migrations` → 404 | `MIGRATION_SECRET` সেট নেই | env var যোগ করে Redeploy, অথবা ধাপ ৩ অনুসরণ করুন |
| `/api/migrations` → 403 | সিক্রেট মিলছে না | Vercel-এর মান হুবহু কপি করুন (আগে/পরে স্পেস না থাকে) |
| বিল্ড ফেল: `Module not found: pg` | — | `next.config.ts`-এ `serverExternalPackages` আছে কিনা দেখুন (এই প্রজেক্টে আছে) |
| বিল্ড ফেল: `drizzle/meta/_journal.json` নেই | ফাইল ট্রেসিং মিস | `next.config.ts` → `outputFileTracingIncludes` রাখুন (আছে) |
| লগইন হচ্ছে না, `database: ok` ঠিক আছে | টেবিল খালি | ধাপ ৩-এ seed করুন, অথবা `/signup` থেকে প্রথম অফিস খুলুন |
| ফাংশন timeout (বড় মাসের সিঙ্ক) | ১০s ডিফল্ট | `vercel.json`-এ `maxDuration: 60` দেওয়া আছে; Hobby প্ল্যানে সর্বোচ্চ 60s |
| বাংলা CSV Excel-এ ভাঙা | — | ফাইলে UTF-8 BOM দেওয়া আছে; Excel 2016+/LibreOffice দিয়ে খুলুন |
| Neon "compute suspended" | ৫ মিনিট নিষ্ক্রিয় থাকলে অটো ঘুমায় | প্রথম রিকোয়েস্টে ~৫০০ms বেশি লাগবে — স্বাভাবিক (cold start) |

---

## ফ্রি টিয়ারের সীমা (জেনে রাখুন)

| সেবা | ফ্রি লিমিট | আপনার জন্য যথেষ্ট? |
|---|---|---|
| **Vercel Hobby** | ১০০ GB ব্যান্ডউইথ/মাস, serverless ফাংশন ৬০s, ১০০ GB-হাওয়ার্স | ✅ কয়েক ডজন অফিস অনায়াসে |
| **Neon Free** | ১৯১.৯ compute hours/মাস, ০.৫ GB স্টোরেজ, ১০ প্রজেক্ট | ✅ ~৫০০ সদস্যের কয়েক মাসের ডেটা; না কুলোলে Launch ($19/মাস) |
| **Apps Script** | দৈনিক কোটা (~২০ মিনিট স্ক্রিপ্ট টাইম) | ✅ দিনে কয়েকবার সিঙ্ক |

> ⚠️ Vercel **Hobby** প্ল্যান শুধু অ-বাণিজ্যিক ব্যবহারের জন্য। অফিস/প্রতিষ্ঠানের আসল ব্যবহার হলে **Pro** ($20/মাস) বা নিজের VPS-এ ডিপ্লয় করুন (`deployment.md` §3)।

স্টোরেজ বাঁকাতে: Neon-এ `0.5 GB` মানে প্রায় কয়েক লাখ মিল/বাজার এন্ট্রি — ছোট-মাঝারি বহু অফিসের জন্য যথেষ্ট।

---

## চেকলিস্ট

- [ ] GitHub-এ কোড পুশ হয়েছে, `.env.local` পুশ হয়নি
- [ ] Neon প্রজেক্ট তৈরি, **pooler** URL কপি করা
- [ ] `npm run db:migrate:remote` (বা `/api/migrations`) → ১৪টি টেবিল
- [ ] Vercel-এ ইমপোর্ট + ৪টি এনভি ভেরিয়েবল সেট
- [ ] `/api/setup/status` → `ready: true`
- [ ] `/signup` থেকে প্রথম অফিস খোলা (বা seed করা ডেমো লগইন)
- [ ] `MIGRATION_SECRET` মুছে ফেলে Redeploy (বিকল্প B ব্যবহার করলে)
- [ ] HTTPS ডোমেইন (ঐচ্ছিক)
- [ ] Google Sheets সিঙ্ক (ঐচ্ছিক)
