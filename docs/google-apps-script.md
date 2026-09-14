# Google Apps Script Setup Guide

গুগল শিট শুধু একটি **রিপোর্টিং কপি** — আসল ডেটা সবসময় PostgreSQL-এ থাকে। শিট সিঙ্ক কনফিগার না করলেও অ্যাপ ১০০% কাজ করবে, আর সিঙ্ক ফেল করলেও কোনো ডেটা হারাবে না (প্রতিটি প্রচেষ্টা `sync_logs` টেবিলে লগ হয়)।

সম্পূর্ণ স্ক্রিপ্ট: [`google-apps-script/Code.gs`](../google-apps-script/Code.gs)

---

## ধাপ ১ — একেক অফিসের জন্য একেকটি Google Spreadsheet

1. [sheets.google.com](https://sheets.new) → নতুন স্প্রেডশিট।
2. নাম দিন অফিসের নাম অনুযায়ী, যেমন: **`Mess Meal Manager - Gobra`**।
3. URL থেকে শিট আইডি কপি করুন:
   ```
   https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit
                                             └──────────┬──────────┘
                                                 SPREADSHEET_ID
   ```

> 🔒 **প্রতিটি অফিসের আলাদা শিট** ব্যবহার করুন — এক শিটে দুই অফিসের ডেটা রাখবেন না (অফিস আইসোলেশন নীতি)।

---

## ধাপ ২ — Apps Script এডিটর খোলা

শিটের ভেতরে: **Extensions → Apps Script**

বাম পাশে `Code.gs` ফাইলে থাকা ডিফল্ট কোড মুছে দিয়ে [`google-apps-script/Code.gs`](../google-apps-script/Code.gs)-এর **পুরো কোড** পেস্ট করুন → **Save** (💾)।

---

## ধাপ ৩ — শিট আইডি বসানো

কোডের শুরুতে `CONFIG` অবজেক্ট:

```js
var CONFIG = {
  SPREADSHEET_ID: '1AbCdEfGhIjKlMnOpQrStUvWxYz',  // ← আপনার শিট আইডি
  API_TOKEN: '',            // চাইলে একটি গোপন টোকেন (নিচে ধাপ ৭)
  FREEZE_HEADER: true,
  WRITE_SYNC_LOG: true,
  MAX_ROWS: 60000,
};
```

শিটের ভেতর থেকেই স্ক্রিপ্ট চালালে (container-bound) `SPREADSHEET_ID: ''` রাখলেও চলবে — স্ক্রিপ্ট তখন স্বয়ংক্রিয়ভাবে ওই শিটেই লিখবে।

---

## ধাপ ৪ — ট্যাব তৈরি (একবার)

Apps Script এডিটরে উপরে ফাংশন ড্রপডাউন থেকে **`setupTabs`** সিলেক্ট করে **Run** চাপুন।

প্রথমবার পারমিশন চাইবে:
`Review permissions → আপনার গুগল অ্যাকাউন্ট → Advanced → Go to <project> (unsafe) → Allow`

এতে ৮টি বাংলা ট্যাব সঠিক ক্রমে তৈরি হবে:

| # | ট্যাব | কী থাকে |
|---|-------|----------|
| 1 | `00_অফিস_ইনফো` | অফিসের নাম, কোড, ম্যানেজার, শিট মেটাডেটা (Key/Value) |
| 2 | `01_সদস্য_তালিকা` | MemberID, Name, Role, Phone, IsActive, OfficeID, MonthID |
| 3 | `02_দৈনিক_মিল_খাতা` | MonthID, Year, Month, Day, Date, MemberID, MemberName, Meals |
| 4 | `03_বাজার_খরচ` | EntryID, MonthID, Date, Day, MemberID, Buyer, Category, Items, Amount, Note |
| 5 | `04_জমা_ও_তহবিল` | EntryID, MonthID, Date, Day, MemberID, Name, Amount, Type, Note |
| 6 | `05_অন্যান্য_আয়` | EntryID, MonthID, Date, Day, Source, Amount, Note |
| 7 | `06_হিসাব_সামারি` | MonthID, MonthName, TotalMembers, TotalMeals, MealRate, TotalBazar, OtherIncome, NetMealCost, PermanentFund, SharedExtra, LastBalance, SyncedAt |
| 8 | `07_দেনা_পাওনা` | MonthID, MemberID, Name, Role, TotalMeals, MealRate, MealCost, IndividualExtra, SharedExtra, TotalMealCost, PermanentFund, DenaPoana, Status |

সিঙ্কের সময় অতিরিক্ত `99_সিংক_লগ` ট্যাবও তৈরি হবে (প্রতিটি সিঙ্কের রেকর্ড)।

---

## ধাপ ৫ — Web App হিসেবে Deploy

Apps Script এডিটরে: **Deploy → New deployment**

| সেটিংস | মান |
|---|---|
| Type | **Web app** |
| Description | `Mess Meal Manager sync v1` |
| **Execute as** | **Me** (আপনার গুগল অ্যাকাউন্ট) |
| **Who has access** | **Anyone** |

**Deploy** → পারমিশন **Allow** → **Web app URL** কপি করুন। এটি দেখতে এমন:

```
https://script.google.com/macros/s/AKfycb…xxxxxxxxxxxxxxxx/exec
```

> ⚠️ URL-এর শেষে **`/exec`** থাকতে হবে (`/dev` নয় — `/dev` শুধু আপনার লগইন করা ব্রাউজারে কাজ করে)।

---

## ধাপ ৬ — অ্যাপে URL বসানো

দুই উপায়ে (অফিস-ভিত্তিক URL প্রায়োরিটি পায়):

**A. অ্যাপের ভেতর থেকে (প্রতি অফিসের জন্য — recommended)**
1. ম্যানেজার/অ্যাডমিন দিয়ে লগইন।
2. **গুগল শিট** ট্যাব → সেটিংস সেকশন।
3. `Apps Script Web App URL` ঘরে `/exec` URL পেস্ট → **সেভ**।
4. একই জায়গায় `Google Sheet URL`-এ শিটের লিংক দিলে "শিট খুলুন" বাটন কাজ করবে।
5. **পিং** চাপলে স্ক্রিপ্টের অবস্থা দেখাবে; **সিঙ্ক করুন** চাপলে পুরো শিট রিরাইট হবে।

**B. `.env.local` (সব অফিসের ডিফল্ট)**
```bash
GOOGLE_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/AKfycb…/exec
```
এরপর `npm run build && npm run start` (বা Vercel-এ env var আপডেট করে redeploy)।

স্বয়ংক্রিয় সিঙ্ক চাইলে: `AUTO_SYNC=1` — প্রতিটি রাইটের পর শিট আপডেট হবে।

---

## ধাপ ৭ — (ঐচ্ছিক) গোপন টোকেন

যে কেউ আপনার `/exec` URL পেয়ে গেলে শিটে লিখতে পারবে না, তা নিশ্চিত করতে:

```js
var CONFIG = { …, API_TOKEN: 'আপনার-গোপন-টোকেন' };
```

অ্যাপের `.env.local`-এ:
```bash
GOOGLE_SCRIPT_API_TOKEN=আপনার-গোপন-টোকেন
```

টোকেন না মিললে স্ক্রিপ্ট `{"ok":false,"error":"Invalid or missing token"}` রিটার্ন করে।

---

## ধাপ ৮ — যাচাই

অ্যাপে: **গুগল শিট → পিং** → সবুজ ব্যাজ + শিটের নাম ও ট্যাব সংখ্যা দেখাবে।
তারপর **সিঙ্ক করুন** → শিট খুলে দেখুন ৮টি ট্যাব ডেটা দিয়ে ভরা।

কমান্ড লাইন থেকে:

```bash
# পিং
curl "https://script.google.com/macros/s/AKfycb…/exec?action=ping"

# একটি ট্যাব পড়ে দেখা
curl "https://script.google.com/macros/s/AKfycb…/exec?action=pull&sheetName=Meals"
```

লোকালে ডিপ্লয় করার **আগেই** যাচাই করতে:

```bash
npm run test:sheet     # ৭০টি চেক — আসল Code.gs + আসল পে-লোড দিয়ে সিমুলেশন
```

---

## স্ক্রিপ্ট কী কী সাপোর্ট করে (API)

| Method | Action | কাজ |
|---|---|---|
| GET | `?action=ping` | সিস্টেম স্ট্যাটাস, শিট আইডি/নাম/URL, কোন ট্যাব মিসিং |
| GET | `?action=pull&sheetName=Meals` | একটি ট্যাবের হেডার + সব সারি ফেরত দেয় |
| GET | `?action=tabs` | সব ট্যাবের নাম ও সারি সংখ্যা |
| POST | `{action:"sync", office, month, sheets:[…]}` | **ফুল সিঙ্ক** — ৮টি ট্যাবই পুরোপুরি রিরাইট |
| POST | `{action:"replaceSheet", sheetName, headers, rows}` | একটি ট্যাব রিরাইট |
| POST | `{action:"pushRows", sheetName, rows}` | সারি অ্যাপেন্ড |
| POST | `{action:"upsertById", sheetName, idColumn, row}` | আইডি মিললে আপডেট, না হলে ইনসার্ট |
| POST | `{action:"deleteById", sheetName, idColumn, id}` | আইডির সারি ডিলিট |

`sheetName`-এ ইংরেজি alias (`Meals`, `Bazar`, `Deposits`, `Income`, `Summary`, `Members`, `Office`, `DenaPaona`) বা সরাসরি বাংলা ট্যাবের নাম — দুটোই চলবে।

প্রতিটি রেসপন্স JSON: `{"ok":true,"message":"Google Sheets full sync OK","sheetUrl":"…","syncedAt":"…","tabs":[…],"totalRows":115}`

**ডেটা টাইপ:** `Meals`, `Amount`, `MealRate` ইত্যাদি সংখ্যা হিসেবে লেখা হয় (শিটে SUM/ফর্মুলা চলে), কিন্তু `MemberID`, `Phone`, `Date` টেক্সট হিসেবে থাকে — ফলে `01711111111` কখনো `1711111111` হয়ে যায় না।

---

## সমস্যা ও সমাধান

| সমস্যা | কারণ | সমাধান |
|---|---|---|
| `Script URL not configured` | অ্যাপে URL দেওয়া নেই | ধাপ ৬ অনুসরণ করুন |
| `Redirected response` / HTML ফিরে আসে | `/dev` URL ব্যবহার বা "Anyone" access দেওয়া নেই | `/exec` URL + **Who has access: Anyone** |
| `Authorization required` | ডিপ্লয়মেন্ট পারমিশন অ্যাড করা হয়নি | নতুন করে Deploy → Allow |
| সিঙ্ক ৫০২/timeout | শিটে অনেক সারি বা Apps Script কোটা শেষ | `MAX_ROWS` কমান, অথবা মাস ধরে সিঙ্ক দিন; কোটা ২৪ ঘণ্টায় রিসেট হয় |
| ট্যাবের নাম মিলছে না | পুরনো ভার্সনের স্ক্রিপ্ট | `Code.gs` আবার পেস্ট করে নতুন ডিপ্লয়মেন্ট বানান |
| শিটে লেখা হচ্ছে কিন্তু অ্যাপে `ok:false` | Apps Script এক্সপেশন | Apps Script → **Executions** লগ দেখুন |
| একই শিটে দুই অফিসের ডেটা মিশে গেছে | এক শিট একাধিক অফিসে সেট করা | প্রতি অফিসের জন্য আলাদা শিট + আলাদা ডিপ্লয়মেন্ট |

> **মনে রাখুন:** সিঙ্ক ব্যর্থ হলেও PostgreSQL-এর ডেটা অক্ষত থাকে। শিট ঠিক করে আবার **সিঙ্ক করুন** চাপলেই পুরো মাসের স্ন্যাপশট নতুন করে বসে যাবে।
