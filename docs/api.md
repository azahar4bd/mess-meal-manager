# API Reference

Base URL: `http://localhost:3000` (or your deployed domain)

All endpoints return JSON:

```jsonc
// success
{ "ok": true, "data": { … } }

// failure
{ "ok": false, "error": "বাংলা এরর মেসেজ", "code": "validation", "fields": { "amount": "…" } }
```

**Auth:** cookie `mmm_session` (HTTP-only, `Secure` in production, `SameSite=Lax`). Every request is validated server-side:
`session → user → status → role → office scope → month scope → permission → database`.

| HTTP status | Meaning |
|---|---|
| 200 | success |
| 400 | validation / bad request (`code: "validation"`, `"unknown-action"`, `"invalid-json"`) |
| 401 | no/expired session, or wrong credentials (`code: "login-required"`, `"invalid-credentials"`) |
| 403 | permission denied, other office's data, closed month (`code: "forbidden"`) |
| 404 | office/month/entry not found |
| 409 | duplicate (`code: "conflict"`) |
| 429 | rate limited (`code: "rate-limited"`, `Retry-After` header) |
| 502 | upstream Apps Script failure (DB is still fine) |

---

## 1 · Authentication

### `POST /api/auth/login`

```jsonc
// request — login may be userId, phone or email
{ "userId": "01711111111", "password": "manager123" }
// equivalent: { "login": "01711111111", "password": "…" }

// response
{
  "ok": true,
  "data": {
    "user": {
      "id": "user_332be1d826e344399115", "userId": "01711111111", "name": "Karim Uddin",
      "email": "", "phone": "01711111111", "branch": "Gobra",
      "officeId": "office_gobra", "officeName": "Gobra Mess",
      "role": "manager", "status": "active",
      "lastLogin": "2026-09-12T09:00:00.000Z", "createdAt": "2026-09-01T00:00:00.000Z"
    },
    "office": { "id": "office_gobra", "name": "Gobra Mess", "branch": "Gobra", "code": "GOBRA01" },
    "activeOfficeId": "office_gobra",
    "home": "meals",
    "requiresApproval": false,
    "status": "active"
    // pending users also get "message": "লগইন সফল হয়েছে, তবে … অনুমোদনের অপেক্ষায় আছে।"
  }
}
// Set-Cookie: mmm_session=…; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800
```

Rejected users (`status: "rejected" | "inactive"`) get **403**. `status: "pending"` can log in but is read-only and receives `requiresApproval: true`.
Brute-force guard: 12 wrong attempts per login id / 10 minutes → **429**.

### `POST /api/auth/logout`
```jsonc
{ "ok": true, "data": { "ok": true } }   // session row deleted, cookie cleared
```

### `GET /api/auth/me`
```jsonc
{
  "ok": true,
  "data": {
    "authenticated": true,
    "user": { …publicUser, "activeOfficeId": "office_gobra", "canSwitchOffice": false },
    "office": { …OfficeDTO of the active office },
    "offices": [ … ],            // admin only — every office; null otherwise
    "months": [ { "id": "office_gobra-2026-09", "year": 2026, "month": 9,
                  "monthName": "September 2026", "totalDays": 30, "isClosed": false }, … ],
    "menu": [ { "tab": "dashboard", "bn": "ড্যাশবোর্ড", "en": "Dashboard", "icon": "▦" }, … ],
    "home": "dashboard",
    "requiresApproval": false
  }
}
// 401 { "ok": false, "error": "অনুগ্রহ করে লগইন করুন", "code": "login-required" }
```

`menu` is already filtered by role (`menuForRole`) — that is what drives the sidebar, so a member only ever receives `[{tab:"report"}]`.

### `POST /api/auth/signup` — new office + manager (spec §10)

```jsonc
{
  "officeName": "Gobra Mess",        // required, 2–80
  "branch": "Gobra",                 // optional
  "address": "Gobra, Gopalganj",     // optional
  "userId": "01711111111",           // required, 4–30, unique
  "managerName": "Karim Uddin",      // required, 2–80
  "email": "",                       // email OR phone required
  "phone": "01711111111",            // email OR phone required
  "password": "manager123",          // required, min 4
  "confirmPassword": "manager123"    // must match
}
```

Creates, in one transaction: **office** (`office_<slug>`, auto `code` e.g. `GOBRA01`) → **manager user** (`role: "manager"`, `status: "active"`) → **current month** (`office_gobra-2026-09`) → session cookie.

```jsonc
{ "ok": true, "data": { "user": {…}, "office": { "id": "office_gobra", "code": "GOBRA01" }, "home": "meals" } }
// 409 duplicate userId  ·  400 with per-field `fields` map on validation errors
```

### `POST /api/auth/join` — member joins via office code (spec §11)

```jsonc
{
  "officeCode": "GOBRA01",           // required
  "userId": "01744444444",           // required, 4–30
  "phone": "01744444444",            // optional (falls back to userId)
  "name": "Rahim Mia",               // required, 2–80
  "email": "",                       // optional
  "room": "Room 3",                  // optional
  "password": "member123",
  "confirmPassword": "member123"
}
```

Creates a `users` row with `role: "member"`, `status: "pending"`, bound to that office. The manager then approves it (`admin.user.status`).

```jsonc
// 404 { "ok": false, "error": "অফিস কোড সঠিক নয়", "code": "not-found" }
```

### `GET /api/health`

Public (no auth). Never throws — a dead database is reported as `ok:false` with HTTP **503**.

```jsonc
{
  "ok": true,
  "app": "Mess Meal Manager",
  "version": "1.0.0",
  "env": "production",
  "time": { "iso": "2026-09-13T09:12:00.000Z", "dhaka": "2026-09-13",
            "timezone": "Asia/Dhaka", "today": "2026-09-13" },
  "database": { "ok": true, "driver": "node-postgres", "latencyMs": 3,
                "offices": 3, "users": 9, "poolTotal": 10, "poolIdle": 9 },
  "database": { "ok": false, "error": "…", "hint": "PostgreSQL চালু করুন …" },  // ← failure path (HTTP 503)
  "googleSheets": { "configured": false }                                          // ← failure path only
}
```

---

## 2 · `POST /api/mess` — the action hub (54 actions)

```jsonc
{ "action": "<action name>", …params }
→ { "ok": true, "data": { "action": "<action name>", "data": … } }
```

`GET /api/mess?action=…&monthId=…` works too (query params become the body); short aliases are supported: `members`, `meals`, `bazar`, `fund`, `income`, `extras`, `months`, `sheet`, `audit`.

**Common params:** `monthId` (`office_gobra-2026-09`) — or `year` + `month` (defaults to the office's current month). The month's office **must** match the caller's office or the request is rejected with 403.

### Bootstrap / navigation

| Action | Params | Capability | Returns |
|---|---|---|---|
| `bootstrap` | — | any logged-in | `{office, months[], month, data, summary, role, home, sync}` |
| `office.current` | — | any | current `OfficeDTO` |
| `office.switch` | `officeId` | **admin** | `{activeOfficeId, office, month, months, data, summary}` |
| `office.updateSettings` | `sheetUrl`, `scriptUrl` | `settings.write` | updated `OfficeDTO` |
| `months.list` | — | any | `MonthDTO[]` (newest first) |
| `month.data` | `monthId?`, `fromDate?`, `toDate?` | `meals.view` | `{month, data, summary, selfOnly}` |
| `me.changePassword` | `currentPassword`, `newPassword` | any | `{ok:true}` |

### Month lifecycle

| Action | Params | Capability | Notes |
|---|---|---|---|
| `month.open` | `year?`, `month?`, `copyMembers?=true`, `carryForwardBalance?=0`, `note?` | `month.write` | new `monthId`, **0 meals**, roster optionally copied |
| `month.close` | `monthId`, `closed?=true` | `month.write` | closed months become read-only for non-admins |
| `month.copyRoster` | `monthId`, `fromMonthId` | `members.write` | copies members from another month **of the same office** |

### Members

| Action | Params | Capability |
|---|---|---|
| `members.list` | `monthId?` | `members.view` |
| `member.create` | `name`, `phone?`, `room?`, `role?`, `note?`, `isActive?` | `members.write` |
| `member.update` | `id`, + any of the above | `members.write` |
| `member.delete` | `id` | `members.write` |

> `members` are **per month** (`members_month_phone_uq` = monthId + phone), so each month keeps its own roster.

### Daily meals

| Action | Params | Capability |
|---|---|---|
| `meals.list` | `monthId?` | `meals.view` |
| `meals.saveDay` | `date` (`YYYY-MM-DD` or `DD/MM/YYYY`), `entries: [{memberId, meals}]` | `meals.write` |
| `meal.set` | `memberId`, `day`, `meals` | `meals.write` |
| `meal.delete` | `id` | `meals.write` |

Rules enforced server-side: `meals` must be a finite number, `0 ≤ meals ≤ 100` (decimals allowed — `0.5`, `1.5`); `meals = 0` deletes the row; the unique key `monthId + memberId + day` means **re-saving a day updates in place**, never duplicates.

```jsonc
// request
{ "action": "meals.saveDay", "monthId": "office_gobra-2026-09", "date": "2026-09-10",
  "entries": [ { "memberId": "mem_8eed4dcfb8904c2c8e33", "meals": 1.5 }, { "memberId": "mem_c712…", "meals": 0 } ] }

// response
{ "ok": true, "data": { "action": "meals.saveDay", "data": { "date": "2026-09-10", "inserted": 1, "updated": 0, "deleted": 1, "totalMeals": 1.5 } } }
```

### Bazar / market expense

| Action | Params | Capability |
|---|---|---|
| `bazar.list` | `monthId?` | `bazar.view` |
| `bazar.create` | `date`, `buyerName`, `amount`, `category?`, `items?`, `memberId?`, `note?` | `bazar.write` |
| `bazar.update` | `id`, + same fields | `bazar.write` |
| `bazar.delete` | `id` | `bazar.write` |

`category` ∈ `Groceries, Vegetables, Meat, Fish, Rice, Oil, Spices, Other`. `date` must fall inside the month → otherwise 400 `তারিখ অবশ্যই September 2026 মাসের হতে হবে`. `amount` must be a positive finite number.

### Fund / deposits

| Action | Params | Capability |
|---|---|---|
| `deposits.list` | `monthId?` | `fund.view` |
| `deposit.create` | `date`, `amount`, `memberName`, `memberId?`, `type?="permanent_fund"`, `note?` | `fund.write` |
| `deposit.update` | `id`, + same fields | `fund.write` |
| `deposit.delete` | `id` | `fund.write` |

`type: "permanent_fund"` is the permanent fund — reported in its **own column** and never subtracted from a member's monthly cost.

### Other income

| Action | Params | Capability |
|---|---|---|
| `incomes.list` | `monthId?` | `income.view` |
| `income.create` | `date`, `title`, `amount`, `note?` | `income.write` |
| `income.update` / `income.delete` | `id`, … | `income.write` |

### Extra expenses (shared / individual)

| Action | Params | Capability |
|---|---|---|
| `extras.list` | `monthId?` | `extras.view` |
| `extra.create` | `date`, `title`, `amount`, `type: "shared" \| "individual"`, `memberId?`, `note?` | `extras.write` |
| `extra.update` / `extra.delete` | `id`, … | `extras.write` |

`type: "individual"` **requires** `memberId` → otherwise 400 `Individual খরচের জন্য সদস্য নির্বাচন করুন`.

### Report

`report.summary` — `monthId?`, `fromDate?`, `toDate?` — capability `report.view`

```jsonc
{
  "ok": true,
  "data": {
    "action": "report.summary",
    "data": {
      "office": { "id": "office_gobra", "name": "Gobra Mess" },
      "month": { "id": "office_gobra-2026-09", "monthName": "September 2026", "totalDays": 30, "isClosed": false },
      "fromDate": null, "toDate": null, "selfOnly": false,
      "summary": {
        "totalMembers": 6, "activeMembers": 6, "totalMeals": 128.5,
        "totalBazar": 5616.25, "otherIncome": 300, "netMealCost": 5316.25,
        "mealRate": 41.37, "permanentFund": 6000, "totalSharedExtra": 400,
        "totalIndividualExtra": 250, "lastBalance": 0,
        "memberCalculations": [
          { "memberId": "mem_8eed4dcfb8904c2c8e33", "name": "Azahar Hossain", "phone": "01711111111",
            "totalMeals": 24.5, "mealCost": 1013.57, "individualExtra": 250,
            "sharedExtra": 66.67, "totalCost": 1330.24, "deposit": 2000,
            "permanentFund": 2000, "denaPoana": 669.76, "status": "receive" }
        ]
      },
      "data": { "id": "office_gobra-2026-09", "members": […], "dailyMeals": […],
                "bazarExpenses": […], "deposits": […], "otherIncomes": […], "extraExpenses": […] },
      "generatedAt": "2026-09-13T15:12:00.000Z"
    }
  }
}
```

`status` ∈ `"due"` (দিবে) · `"receive"` (পাবে) · `"settled"` (সমান).
For `role: "member"` the response contains **only their own row** and `selfOnly: true`.

### Google Sheets

| Action | Params | Capability | Returns |
|---|---|---|---|
| `sheet.status` | — | `sheet.view` | `{scriptUrlConfigured, sheetUrl, lastSyncedAt, autoSync, logs[]}` |
| `sheet.payload` | `monthId?` | `sheet.view` | the exact `SyncPayload` sent to Apps Script |
| `sheet.ping` | — | `sheet.view` | Apps Script status (or `ok:false` when not configured) |
| `sheet.sync` | `monthId?`, `scriptUrl?` | `sheet.sync` | sync result + writes a `sync_logs` row |

`SyncPayload`:

```jsonc
{
  "action": "sync", "version": 1, "syncedAt": "2026-09-13T15:12:00.000Z",
  "office": { "id": "office_gobra", "name": "Gobra Mess", "code": "GOBRA01", … },
  "month":  { "id": "office_gobra-2026-09", "name": "September 2026", "year": 2026, "month": 9 },
  "sheets": [
    { "name": "00_অফিস_ইনফো",     "headers": ["Key","Value"], "rows": [[…], …] },
    { "name": "01_সদস্য_তালিকা",  "headers": ["MemberID","Name","Role","Phone","Room","IsActive","OfficeID","MonthID"], "rows": […] },
    { "name": "02_দৈনিক_মিল_খাতা","headers": ["MonthID","Year","Month","Day","Date","MemberID","MemberName","Meals"], "rows": […] },
    { "name": "03_বাজার_খরচ",     "headers": […], "rows": […] },
    { "name": "04_জমা_ও_তহবিল",   "headers": […], "rows": […] },
    { "name": "05_অন্যান্য_আয়",   "headers": […], "rows": […] },
    { "name": "06_হিসাব_সামারি",  "headers": […], "rows": [[…]] },
    { "name": "07_দেনা_পাওনা",    "headers": […], "rows": […] }
  ]
}
```

### Audit trail

`audit.list` — `monthId?`, `limit?`, `scope?: "all"` (admin only) — capability `audit.view`

```jsonc
{ "ok": true, "data": { "action": "audit.list", "data": [
  { "id": "aud_b6a88497f95249e0949b", "at": "2026-09-13T15:11:04.000Z", "userName": "Karim Uddin", "role": "manager",
    "officeId": "office_gobra", "monthId": "office_gobra-2026-09", "action": "bazar.create",
    "entity": "bazar", "entityId": "bzr_8ecbaefa0c8e41998d85", "ok": true, "message": "বাজার: ৳1250 (Karim Uddin)", "ip": "…" } ] } }
```

### Admin panel

| Action | Params | Capability | Notes |
|---|---|---|---|
| `admin.summary` | — | `office.manage` or `user.manage` | platform totals (offices, users, months, pending…) |
| `admin.offices.list` | `includeInactive?` | `office.manage` | every office + manager + month counts |
| `admin.office.create` | `name`, `branch?`, `code?`, `address?`, `managerName?`, `managerEmail?`, `managerPhone?`, `status?`, `sheetUrl?`, `scriptUrl?`, `note?` | `office.manage` | |
| `admin.office.update` | `id`, + any field, `isDefault?` | `office.manage` | |
| `admin.office.status` | `id`, `status` | `office.manage` | `active` / `inactive` / `pending` |
| `admin.office.delete` | `id`, `confirm` | `office.manage` | `confirm` must equal the office **name or code** — otherwise 400 |
| `admin.users.list` | `officeId?`, `role?`, `status?` | `members.approve` | managers see **only their own office**, never admins |
| `admin.pendingUsers` | — | `members.approve` | join requests awaiting approval |
| `admin.user.create` | `userId`, `name`, `role`, `officeId?`, `email?`, `phone?`, `branch?`, `password?`, `status?` | `user.manage` | managers may only create in their own office |
| `admin.user.update` | `id`, + fields (`name`, `email`, `phone`, `branch`, `userId`, `role`, `status`, `officeId`) | `user.manage` | non-admins cannot touch admins or other-office users |
| `admin.user.status` | `id`, `status` | `members.approve` | **approve/reject join requests** |
| `admin.user.resetPassword` | `id`, `password` | `members.approve` | bcrypt re-hash |
| `admin.user.delete` | `id` | `user.manage` | deletes the user **and** their sessions; you cannot delete yourself |

Passwords are never returned. `SHOW_PASSWORDS_IN_ADMIN=1` (dev only) is required for any password echo.

---

## 3 · `POST /api/sync` — Sheets sync endpoint

```jsonc
// request
{ "action": "sync", "monthId": "office_gobra-2026-09" }
// action ∈ sync | ping | payload | pull | logs ; pull also takes sheetName

// response
{ "ok": true, "data": { "action": "sync", "result": { "ok": true, "message": "Google Sheets full sync OK",
  "sheetUrl": "https://docs.google.com/spreadsheets/d/…/edit", "syncedAt": "…", "totalRows": 115,
  "logId": "sync_f86cd9acfb2c4f7398e8" } } }
```

`GET /api/sync?action=status` → quick config probe for the UI.
When no Apps Script URL is configured the call returns `ok:false` with a Bengali explanation, **logs the attempt**, and the database is untouched (the write that triggered it already committed).

---

## 4 · Report exports

### `GET /api/report/export`

| Query | Values | Default |
|---|---|---|
| `format` | `csv`, `html` (`pdf`/`print` → html) | `csv` |
| `variant` | `full`, `members`, `meals`, `bazar`, `deposits`, `incomes`, `extras` | `full` |
| `monthId` | e.g. `office_gobra-2026-09` | current month |
| `fromDate`, `toDate` | `YYYY-MM-DD` | whole month |

```
GET /api/report/export?format=csv&variant=full&monthId=office_gobra-2026-09
→ 200 text/csv; charset=utf-8
  Content-Disposition: attachment; filename="Gobra-Mess_September-2026_full.csv"
  body starts with EF BB BF (UTF-8 BOM) so Excel renders Bangla correctly
```

Capability: `report.export`. `format=html` returns a self-contained A4 print document (`@page A4`, Bangla headings, member table, dena-poona, signature lines) — the browser's **Print → Save as PDF** produces the PDF.

### `GET /api/report/pdf`
Same document as `format=html`, with `Content-Disposition: inline; filename="…-report.pdf.html"` so it opens in a print dialog.

---

## 5 · Google Apps Script endpoint (deployed separately)

See [`docs/google-apps-script.md`](google-apps-script.md) for setup and [`google-apps-script/Code.gs`](../google-apps-script/Code.gs) for the source.

| Method | Call | Purpose |
|---|---|---|
| GET | `?action=ping` | status, spreadsheet id/name/url, missing tabs |
| GET | `?action=pull&sheetName=Meals` | read one tab (headers + rows) |
| GET | `?action=tabs` | list tabs with row counts |
| POST | `{action:"sync", office, month, sheets}` | full rewrite of all 8 tabs |
| POST | `{action:"replaceSheet", sheetName, headers, rows}` | rewrite one tab |
| POST | `{action:"pushRows", sheetName, rows}` | append rows |
| POST | `{action:"upsertById", sheetName, idColumn, row}` | update-or-insert by id |
| POST | `{action:"deleteById", sheetName, idColumn, id}` | delete by id |

---

## 6 · Rate limits

| Scope | Limit | Key |
|---|---|---|
| login attempts | 12 / 10 min | per login id + IP |
| signup | 6 / hour | per IP |
| join | 8 / hour | per IP |
| `/api/mess` writes | 900 / min | per session |
| `/api/sync` | 30 / min | per session |
| exports | 60 / min | per session |

Exceeding a limit returns **429** with `Retry-After`. The limiter is in-memory per process — on multi-instance deployments put it behind a sticky load balancer or swap in a Redis-backed limiter in `src/lib/rate-limit.ts`.

---

## 7 · curl cookbook

```bash
BASE=http://localhost:3000
J=/tmp/cookies.txt

# login
curl -s -c $J -X POST $BASE/api/auth/login -H 'content-type: application/json' \
  -d '{"userId":"01711111111","password":"manager123"}'

# today's meals for the whole office
curl -s -b $J -X POST $BASE/api/mess -H 'content-type: application/json' \
  -d '{"action":"meals.saveDay","date":"2026-09-13","entries":[{"memberId":"mem_b595e8e3c525408b8c0b","meals":1.5}]}'

# monthly report
curl -s -b $J -X POST $BASE/api/mess -H 'content-type: application/json' \
  -d '{"action":"report.summary","monthId":"office_gobra-2026-09"}'

# CSV download
curl -s -b $J -o report.csv "$BASE/api/report/export?format=csv&variant=full&monthId=office_gobra-2026-09"

# print-ready PDF page
curl -s -b $J "$BASE/api/report/export?format=html&monthId=office_gobra-2026-09" -o report.html

# sync to Google Sheets
curl -s -b $J -X POST $BASE/api/sync -H 'content-type: application/json' -d '{"action":"sync"}'

# logout
curl -s -b $J -c $J -X POST $BASE/api/auth/logout
```
