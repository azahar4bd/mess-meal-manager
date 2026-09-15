# 🔑 অ্যাকাউন্ট কার্ড — Mess Meal Manager (নতুন সেশনের জন্য)

> এই ফাইলটাই এই অ্যাপের "সবকিছুর নকশা"। নতুন কোনো chat/সেশন শুরু করলে এই ফাইলটা
> (বা এর তথ্যগুলো) পেস্ট করলেই আগের সব অবস্থা বুঝে কাজ চালিয়ে যাওয়া যাবে।
> এতে কোনো পাসওয়ার্ড/টোকেন লেখা নেই — নিরাপদে রিপোতে রাখা যায়।
>
> শেষ হালনাগাদ: **২০২৬-০৯-১৫**

---

## ১. এক নজরে ঠিকানা

| কী কী | মান |
|---|---|
| **লাইভ অ্যাপ (একমাত্র official লিংক)** | **https://messmealmanager.vercel.app** |
| Login পেজ | https://messmealmanager.vercel.app/login |
| স্বাস্থ্য চেক | https://messmealmanager.vercel.app/api/health |
| সেটআপ স্ট্যাটাস | https://messmealmanager.vercel.app/api/setup/status |
| GitHub রিপো (private) | https://github.com/azahar4bd/mess-meal-manager |
| Production branch | `main` — push করলেই Vercel নিজে deploy নেয় |

**লগইন আইডি (পাসওয়ার্ড রিপোতে লেখা নেই — ভুলে গেলে নিচের ধাপে রিসেট):**

- Platform admin: **01714352662** (Azahar)
| Manager (Gobra01): **01994259616** (Sakib)

---

## ২. Vercel (যেখানে app চলে)

| আইটেম | মান |
|---|---|
| Team/Workspace | `azahar4bd-5195` (team id `team_qYI08i62sNyeFJiT5DeTmTFk`) |
| প্রজেক্ট নাম / id | `mess-meal-manager` / `prj_upwh1gXhOl95fbrhQZ1aKgm6mZ5V` |
| Dashboard | https://vercel.com/azahar4bd-5195/mess-meal-manager |
| Env vars পেজ | https://vercel.com/azahar4bd-5195/mess-meal-manager/settings/environment-variables |
| Deploy hooks পেজ | https://vercel.com/azahar4bd-5195/mess-meal-manager/settings/git |

### এক-ক্লিক Redeploy Hook (গিট push ছাড়াই)

নিচের লিংকে **POST** করলেই (বা ব্রাউজারে খুললেই) `main` থেকে নতুন production deploy হয়:

```
https://api.vercel.com/v1/integrations/deploy/prj_upwh1gXhOl95fbrhQZ1aKgm6mZ5V/UcjDWbGLnm
```

উদাহরণ (কোনো login/token লাগে না):

```bash
curl -X POST "https://api.vercel.com/v1/integrations/deploy/prj_upwh1gXhOl95fbrhQZ1aKgm6mZ5V/UcjDWbGLnm"
```

> এই URL-টা গোপন রাখতে হবে (যার কাছে থাকবে সে deploy ট্রিগার করতে পারবে, ডেটা দেখতে পারবে না)।
> পুরোনো/চুরি হয়ে গেলে উপরের Deploy hooks পেজ থেকে রিজেনারেট করা যায়।

**প্রয়োজনীয় Environment variables (production):**

- `DATABASE_URL` — আসল Neon DB-র **pooled** URL (host-এ `-pooler`, শেষে `?sslmode=require`)
- `NODE_ENV=production`, `AUTO_SYNC=0`, `SHOW_PASSWORDS_IN_ADMIN=0`
- `MIGRATION_SECRET` — স্থায়ীভাবে **খালি/মুছে** রাখতে হবে (শুধু জরুরি migration-এর সময় সাময়িকভাবে বসাতে হয়)
- `SESSION_SECRET` — এই অ্যাপ আসলে ব্যবহার করে না (সেশন DB-তে টোকেনে চলে); থাকলেও ক্ষতি নেই

---

## ৩. Neon ডেটাবেস (যেখানে সব ডেটা থাকে)

| আইটেম | মান |
|---|---|
| **আসল DB প্রজেক্ট** | `mess-meal-manager` — id **`crimson-paper-45626816`** |
| Region | AWS US East (`aws-us-east-1`) — Vercel ফাংশনের কাছে, দ্রুত |
| Branch | `main` (`br-small-frog-avqyylsr`) · DB `neondb` · role `neondb_owner` |
| Console | https://console.neon.tech (এই প্রজেক্টটা সিলেক্ট করুন) |
| ব্যাকআপ branch | **`recovery-backup-2026-09-15`** (রিকভারির দিন বানানো নিরাপদ কপি) |
| Rebate-এর DB (ছোঁবেন না) | `Rebate` — id `aged-star-42437426` (Singapore) |

- **Pooled URL নিতে:** Neon Console → প্রজেক্ট → **Connect** → Connection pooling **ON** → URL কপি।
- প্রতি মাসের শেষে/নতুন স্কিমার পর migration (idempotent, নিরাপদ):
  ```bash
  DATABASE_URL="postgresql://…-pooler.….neon.tech/neondb?sslmode=require" npm run db:migrate:remote
  ```
- **Admin পাসওয়ার্ড রিসেট/তৈরি (ডেটা না মুছে):**
  ```bash
  DATABASE_URL="postgresql://…-pooler.….neon.tech/neondb?sslmode=require" \
    npm run admin:create:remote -- --userId=01714352662 --password='নতুন-পাসওয়ার্ড' --name='Azahar'
  ```
- **ব্যাকআপ/রিস্টোর:** Neon-এ Branch বানিয়ে তাৎক্ষণিক স্ন্যাপশট; পুরোনো অবস্থায় ফিরতে branch থেকে restore/new branch। লোকাল ডাম্প:
  ```bash
  pg_dump "postgresql://…pooler…neon.tech/neondb?sslmode=require" -F c -f mess-$(date +%F).dump
  ```

---

## ৪. নতুন সেশনে আমাকে (AI-কে) যেভাবে কাজ করাবেন

আমার কাছে ড্যাশবোর্ডের login নেই — পরিবর্তন করতে হলে স্বল্পমেয়াদি টোকেন লাগে (কাজ শেষে revoke করবেন):

1. **Vercel token** (env বদলানো/deploy দেখা): https://vercel.com/account/tokens → Create (১ দিন expiry)
2. **Neon API key** (DB দেখা/ব্যাকআপ): https://console.neon.tech/app/settings/api-keys
3. **GitHub token** (কোড push): https://github.com/settings/personal-access-tokens/new → শুধু এই রিপো, Contents: Read and write, ১ দিন
4. নতুন chat-এ এই ফাইলটা পেস্ট করুন (বা বলুন: *"mess-meal-manager অ্যাপে কাজ করতে চাই, docs/ACCOUNT-CARD.md দেখো"*) আর দরকারি টোকেন দিন।

**টোকেন ছাড়াও যা নিজেই করতে পারবেন:**
- Redeploy: §২-এর Deploy Hook লিংকে POST
- কোড আপডেট: রিপোতে `main`-এ push → অটো deploy
- env বদল: §২-এর Env vars পেজ, তারপর Deploy Hook
- ডেটা দেখা/ব্যাকআপ: Neon Console
- অফিস/মিল সব অপারেশন: লাইভ অ্যাপের UI

---

## ৫. যা যা পরিষ্কার করা হয়েছে (২০২৬-০৯-১৫)

- ❌ পুরোনো ডুপ্লিকেট Vercel প্রজেক্ট **`cash-gobra`** ও তার ৩টা লিংক স্থায়ীভাবে মুছা হয়েছে (এখন 404)
- ❌ বিভ্রান্তিকর অ্যালিয়াস `messmeal-smoky.vercel.app`, `mess-meal-manager-orcin.vercel.app`,
  `messmeal-azahar4bd-5195.vercel.app` সরানো হয়েছে — এখন **একটাই লিংক**
- ❌ পুরোনো পরিত্যক্ত Neon প্রজেক্ট (patient-mountain, sparkling-butterfly, little-surf — সব Singapore) মুছা হয়েছে
- ✅ আসল DB `crimson-paper`-এ বাকি migration বসানো হয়েছে এবং Vercel-এর সাথে যুক্ত করা হয়েছে
- ✅ নিরাপত্তা ব্যাকআপ branch: `recovery-backup-2026-09-15`
- ⛔ **Rebate** সংক্রান্ত কোনো Vercel প্রজেক্ট/DB (`Rebate`, `rebate`, `app`, `rebate-pksf`,
  `rebate-calculator-eight`, Neon `aged-star`) কখনো ছোঁয়া/মোছা হয়নি — ভবিষ্যতেও নয়
