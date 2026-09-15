# Render-এ ডিপ্লয় গাইড — Mess Meal Manager

এই গাইড অনুযায়ী **Mess Meal Manager** অ্যাপটি Render-এ চলবে — একটি Managed
PostgreSQL ডেটাবেস সহ, এবং GitHub-এর `main` শাখায় প্রতি push-এ নিজে থেকে
auto-deploy হবে।

> পুরো সেটআপটা রিপোর মূল ফোল্ডারের [`render.yaml`](../render.yaml) ফাইলে
> Blueprint হিসেবে লেখা আছে — সার্ভার, ডেটাবেস, এনভায়রনমেন্ট ভেরিয়েবল,
> migration — সবকিছু ওই একটা ফাইল থেকেই তৈরি হয়।

---

## ১. কী কী তৈরি হবে

| রিসোর্স | নাম | প্ল্যান | খরচ |
|---|---|---|---|
| Web Service (Next.js 16) | `mess-meal-manager` | free | $0 |
| PostgreSQL 17 | `mess-meal-db` | free | $0 |

- প্রতি deploy-এর **আগে** `npm run db:migrate:remote` দিয়ে ডেটাবেস migration
  নিজে থেকে চলবে (একই migration একাধিকবার চলে না — নিরাপদ)।
- `SESSION_SECRET` Render নিজেই একবার র‍্যান্ডমভাবে বানিয়ে দেবে।
- ওয়েব সার্ভিস Render-এর দেওয়া `$PORT`-এ bind করে (`0.0.0.0`)।
- Health check: `/api/health`।

> ⚠️ **ফ্রি প্ল্যানের সীমাবদ্ধতা**
> - **ফ্রি ওয়েব সার্ভিস** ১৫ মিনিট কোনো রিকোয়েস্ট না এলে ঘুমিয়ে যায়; পরের
>   রিকোয়েস্টে ~৩০–৬০ সেকেন্ড কোল্ড স্টার্ট লাগে। সবসময় চালু রাখতে সার্ভিসের
>   প্ল্যান `0.5c-512mb` (~$৭/মাস) করুন।
> - **ফ্রি ডেটাবেস তৈরির ৩০ দিন পর মেয়াদ শেষ হয়ে যায়** (তারপর ১৪ দিন গ্রেস
>   পিরিয়ড, তারপর ডেটা মুছে যায়)। স্থায়ীভাবে ফ্রি রাখতে নিচের
>   [Neon অপশন](#প্রডাকশন-ও-সথায়ী-ফ্রি-অপশন) দেখুন, নয়তো DB প্ল্যান
>   `0.1c-256mb` (~$৭/মাস) করুন।

---

## ২. এক ক্লিকে ডিপ্লয় (সবচেয়ে সহজ)

`render.yaml` ফাইলটি GitHub-এর `main` শাখায় থাকলে নিচের বাটনে ক্লিক করুন:

**https://render.com/deploy?repo=https://github.com/azahar4bd/mess-meal-manager**

(অথবা README-তে যোগ করা **“Deploy to Render”** বাটনটা ব্যবহার করুন।)

## ৩. ধাপে ধাপে কাজ

1. **Render-এ সাইন আপ/লগইন** করুন — [dashboard.render.com](https://dashboard.render.com)
   (GitHub দিয়ে লগইন করলেই সবচেয়ে সুবিধা)।
2. উপরের ডিপ্লয় লিংকে যান, অথবা ড্যাশবোর্ডে **New + → Blueprint**-এ ক্লিক করুন।
3. GitHub অ্যাকাউন্ট কানেক্ট করে **`azahar4bd/mess-meal-manager`** রিপোটি
   সিলেক্ট করুন (রিপোর মূল ফোল্ডারে `render.yaml` আছে দেখলে Render নিজে থেকে
   চিনে নেবে)।
4. Blueprint-এর নাম দিন (যেমন `mess-meal-manager`), **Region: Singapore**
   রাখুন (বাংলাদেশের সবচেয়ে কাছে)।
5. `GOOGLE_SCRIPT_WEB_APP_URL` চাইলে **খালি রেখে Apply করুন** — Google Sheets
   সিঙ্ক ঐচ্ছিক, পরে সেট করা যাবে।
6. **Apply** চাপুন। Render তখন একসাথে তৈরি করবে:
   - `mess-meal-db` (PostgreSQL)
   - `mess-meal-manager` ওয়েব সার্ভিস — build → **migration** → start
7. ডিপ্লয় সফল হলে সার্ভিস পেজের উপরে URL পাবেন, যেমন:
   **`https://mess-meal-manager.onrender.com`**

## ৪. প্রথম ব্যবহার

1. `/api/setup/status` URL খুলে দেখুন — `"ok": true` এলে স্কিমা প্রস্তুত।
2. **`/signup`** পেজে গিয়ে প্রথম অফিস (মেস) আর ম্যানেজার অ্যাকাউন্ট খুলুন।
3. তারপর **`/login`** থেকে লগইন করে অ্যাপ ব্যবহার শুরু করুন।
4. (ঐচ্ছিক) Google Sheets সিঙ্ক চালু করতে:
   - Apps Script Web App-এর `/exec` URL সার্ভিসের **Environment** ট্যাবে
     `GOOGLE_SCRIPT_WEB_APP_URL` হিসেবে যোগ করে save দিন — নতুন deploy হবে।

---

## ৫. Auto-deploy (পরের আপডেটগুলো)

`render.yaml`-এ `autoDeployTrigger: commit` সেট করা আছে — `main` শাখায়
প্রতিবার push করলেই Render নিজে থেকে নতুন করে build + deploy করবে, আর deploy-এর
আগে pending DB migration চালাবে। কোনো ম্যানুয়াল ধাপ লাগবে না।

```bash
git add .
git commit -m "..."
git push origin main        # → Render নিজে থেকে deploy শুরু করবে
```

---

## ৬. প্রডাকশন ও স্থায়ী ফ্রি অপশন

### অপশন A — Render-এর পেইড ডেটাবেস (সবচেয়ে সহজ, ~$৭/মাস)
`render.yaml`-এ ডেটাবেসের প্ল্যান বদলে commit/push করুন:

```yaml
databases:
  - name: mess-meal-db
    plan: 0.1c-256mb      # ~$৬–৭/মাস, মেয়াদ শেষ হয় না
```

সার্ভিস সবসময় গরম রাখতে:

```yaml
    plan: 0.5c-512mb      # ~$৭/মাস, কোনো কোল্ড স্টার্ট নেই
```

### অপশন B — স্থায়ী ফ্রি Neon ডেটাবেস ($0, scale-to-zero)
অ্যাপটা Neon serverless driver নিজে থেকেই সাপোর্ট করে।

1. [neon.tech](https://neon.tech)-এ ফ্রি অ্যাকাউন্ট খুলে একটা PostgreSQL
   ডেটাবেস বানান।
2. **Pooled** connection string কপি করুন (host-এ `-pooler` থাকবে, শেষে
   `?sslmode=require`)।
3. Render ড্যাশবোর্ডে সার্ভিসের **Environment** ট্যাবে:
   - `DATABASE_URL` = Neon pooled URL (render.yaml-এর fromDatabase লাইনটা
     ড্যাশবোর্ড থেকে মুছে/ওভাররাইট করে এই ভ্যালু দিন),
   - `DB_DRIVER` = `neon`
4. Render-এর ফ্রি ডেটাবেসটা Blueprint থেকে বাদ দিতে `render.yaml`-এর
   `databases:` অংশ এবং `DATABASE_URL`-এর `fromDatabase` ব্লক সরিয়ে দিন।

---

## ৭. সমস্যা সমাধান

**Build-এ memory (OOM) সমস্যা হলে**
ফ্রি ইনস্ট্যান্সে ৫১২ MB RAM। সার্ভিস → **Environment**-এ যোগ করুন:
`NODE_OPTIONS = --max-old-space-size=384`, তারপর আবার deploy করুন। তাতেও না
হলে প্ল্যান `0.5c-512mb` করুন।

**Migration ম্যানুয়ালি চালানো দরকার হলে**
অ্যাপে এক-শট এন্ডপয়েন্ট আছে:

1. **Environment**-এ `MIGRATION_SECRET = <openssl rand -hex 24>` সেট করে
   deploy দিন।
2. ব্রাউজারে একবার খুলুন (SECRET বসিয়ে):
   `https://<your-app>.onrender.com/api/migrations?secret=<SECRET>`
3. `/api/setup/status`-এ `"ok": true` দেখে নিয়ে **`MIGRATION_SECRET`
   ভেরিয়েবলটি মুছে ফেলুন** আবার deploy দিন।

**ডেটাবেসে সংযোগ হচ্ছে না**
- সার্ভিস ও ডেটাবেস একই **region**-এ আছে কিনা দেখুন (দুটোই `singapore`)।
- সার্ভিসের **Environment**-এ `DATABASE_URL` আছে কিনা আর তার শেষ/মধ্যে ভুল
  স্পেস নেই কিনা দেখুন।
- সার্ভিসের **Logs** আর `/api/health`-এর JSON-এ driver (`node-postgres (tcp)`)
  ও error দেখুন।

**লগ দেখা**
Render ড্যাশবোর্ড → সার্ভিস → **Logs** ট্যাব। build log, migration output
(`✓ applied : 0000_init …`) আর runtime error — সবই এখানে পাবেন।

---

## ৮. render.yaml-এ এনভায়রনমেন্ট ভেরিয়েবল রেফারেন্স

| ভেরিয়েবল | মান | মন্তব্য |
|---|---|---|
| `DATABASE_URL` | DB থেকে অটো (`connectionString`) | Render-এর ভেতরের private URL |
| `DB_DRIVER` | `pg` | Render Postgres-এর জন্য node-postgres |
| `SESSION_SECRET` | Render জেনারেট করে | সেশন এনক্রিপশন কী |
| `NODE_ENV` | `production` | secure cookie ইত্যাদির জন্য |
| `NODE_VERSION` | `22.14.0` | Next.js 16-এর জন্য 20.9+ লাগে |
| `PG_POOL_MAX` | `10` | কানেকশন পুল সাইজ |
| `GOOGLE_SCRIPT_WEB_APP_URL` | খালি/পরে দিন | ঐচ্ছিক Sheets সিঙ্ক |
| `AUTO_SYNC` | `0` | প্রতি write-এ অটো সিঙ্ক বন্ধ |
