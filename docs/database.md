# Database Design — PostgreSQL + Drizzle ORM

**Primary database = PostgreSQL.** Google Sheets is only a reporting copy; nothing critical is ever stored solely in a sheet.

Schema source: [`src/db/schema.ts`](../src/db/schema.ts) · Migration: [`drizzle/0000_init.sql`](../drizzle/0000_init.sql) · Connection: [`src/db/index.ts`](../src/db/index.ts)

```bash
npm run db:push      # dev: push the schema directly
npm run db:generate  # create a new migration file after changing schema.ts
npm run db:migrate   # apply migrations (use this on servers with real data)
npm run db:studio    # Drizzle Studio GUI
npm run db:seed      # demo data (idempotent)
npm run db:reset     # DROP every table (destructive)
```

---

## 1 · Enums

| Enum | Values |
|---|---|
| `role` | `admin`, `manager`, `member`, `audit` |
| `user_status` | `pending`, `approved`, `rejected`, `inactive`, `active` |
| `office_status` | `pending`, `approved`, `active`, `inactive` |
| `bazar_category` | `Groceries`, `Vegetables`, `Meat`, `Fish`, `Rice`, `Oil`, `Spices`, `Other` |
| `extra_type` | `shared`, `individual` |

---

## 2 · Entity relationships

```
offices (1) ─┬─< users            (officeId nullable → NULL = platform admin)
             ├─< mess_months      (officeId)
             │      ├─< members        (monthId)   ← roster is PER MONTH
             │      ├─< daily_meals    (monthId, memberId)
             │      ├─< bazar_expenses (monthId)
             │      ├─< deposits       (monthId, memberId?)
             │      ├─< other_incomes  (monthId)
             │      └─< extra_expenses (monthId, memberId?)
             ├─< sync_logs
             └─  settings (officeId nullable → NULL = global)

users (1) ──< sessions      (deleted on logout / user delete / password reset)
everything ──< audit_logs   (append-only trail)
```

**Isolation keys:** every ledger table carries **both** `office_id` and `month_id`, and every query in [`src/lib/mess-data.ts`](../src/lib/mess-data.ts) filters by both. A cross-office `monthId` is rejected at the API layer (403) *before* it ever reaches SQL.

**Identifier formats**

| Entity | Format | Example |
|---|---|---|
| office | `office_<slug>` | `office_gobra` |
| month | `<officeId>-YYYY-MM` | `office_gobra-2026-09` |
| member | `mem_<16 hex>` | `mem_b595e8e3c525408b8c0b` |
| user | `user_<20 hex>` | `user_332be1d826e344399115` |
| office code | `<SLUG><2 digits>` | `GOBRA01` |
| ledger rows | `meal_…`, `bzr_…`, `dep_…`, `inc_…`, `ext_…` | `bzr_8ecbaefa0c8e41998d85` |
| audit / sync rows | `aud_…`, `sync_…` | |
| session | 64-char base64url random token | the `mmm_session` cookie value |

---

## 3 · Tables

### `offices`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `office_<slug>` |
| `name` | text NOT NULL | |
| `branch` | text `''` | |
| `code` | text NOT NULL | **UNIQUE** — the join code members use |
| `manager_name` / `manager_email` / `manager_phone` | text | contact block |
| `status` | `office_status` = `active` | |
| `is_default` | bool = false | one default office for new signups |
| `sheet_url` | text `''` | Google Sheet link (per office) |
| `sheet_id` | text `''` | extracted from `sheet_url` |
| `script_url` | text `''` | **Apps Script `/exec` URL (per office — wins over env)** |
| `last_synced_at` | timestamptz NULL | |
| `address`, `note` | text `''` | |
| `created_at`, `updated_at` | timestamptz | |

`UNIQUE offices_code_uq(code)`

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `user_…` |
| `user_id` | text NOT NULL | **UNIQUE** — the login handle (phone/email/custom) |
| `name` | text NOT NULL | |
| `email`, `phone`, `branch` | text `''` | |
| `office_id` | text NULL | **NULL only for the platform admin** |
| `role` | `role` = `member` | |
| `status` | `user_status` = `pending` | joiners stay `pending` until approved |
| `password` | text NOT NULL | **bcrypt hash (cost 10), never plaintext** |
| `last_login` | timestamptz NULL | |
| `created_at`, `updated_at` | timestamptz | |

`UNIQUE users_user_id_uq(user_id)` · `INDEX users_office_idx(office_id)` · `INDEX users_phone_idx(phone)`

### `sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | the random cookie value (`mmm_session`) |
| `user_id` | text NOT NULL | |
| `role` | `role` NOT NULL | cached so a role change invalidates intent |
| `office_id` | text NULL | the user's home office |
| `current_office_id` | text NULL | admin's switched-to office |
| `ip`, `user_agent` | text `''` | |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz NOT NULL | 7 days; expired rows are ignored and pruned |

Logout / password reset / user delete all remove the rows → instant invalidation.

### `mess_months`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `<officeId>-YYYY-MM` |
| `office_id` | text NOT NULL | |
| `year` | int NOT NULL | |
| `month` | int NOT NULL | 1–12 |
| `month_name` | text NOT NULL | e.g. `September 2026` |
| `total_days` | int NOT NULL | 28–31, computed for that year (leap-safe) |
| `is_closed` | bool = false | closed ⇒ read-only for non-admins |
| `carry_forward_balance` | numeric(14,2) = 0 | opening balance carried from the previous month |
| `note` | text `''` | |
| `created_at`, `updated_at` | timestamptz | |

`UNIQUE mess_months_office_year_month_uq(office_id, year, month)` · `INDEX mess_months_office_idx(office_id)`

> **Rule 7 (month isolation)** is enforced by this unique key plus `monthId` on every ledger row. Opening a new month inserts a fresh row — old rows are never touched.

### `members`  (the monthly roster)
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `mem_…` |
| `office_id` | text NOT NULL | |
| `month_id` | text NOT NULL | roster belongs to a month |
| `name` | text NOT NULL | |
| `role` | text = `member` | in-mess label (manager/member/guest…) |
| `is_active` | bool = true | only active members share the **shared extra** |
| `phone` | text `''` | |
| `password` | text `''` | optional member-level password (bcrypt when used) |
| `note` | text `''` | |
| `sort_order` | integer `0` | ব্যবহারকারীর নিজের পছন্দমতো ক্রম (`members.reorder`) — সদস্য পেজ ও মিল এন্ট্রি/মাস গ্রিডে একই ক্রম |
| `opening_due` | numeric(14,2) `0` | আগের মাসের বাকি (জের) — নতুন মাসে নিজের টাকার বাজার/`jer_payment` থেকে সমন্বয় হয় (Rule 9) |
| `joined_at`, `created_at`, `updated_at` | timestamptz | |

`UNIQUE members_month_phone_uq(month_id, phone)` · `INDEX members_office_idx`, `members_month_idx`

তালিকা সবসময় `ORDER BY sort_order ASC, is_active ASC, name ASC` — নতুন সদস্য স্বয়ংক্রিয়ভাবে শেষের নম্বর পায়, আগের মাস থেকে কপি করলেও ক্রম বজায় থাকে।

### `daily_meals`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `meal_…` |
| `office_id`, `month_id` | text NOT NULL | |
| `member_id` | text NOT NULL | references `members.id` (no FK — rosters are per month) |
| `day` | int NOT NULL | 1…`total_days` |
| `date` | date NOT NULL | `YYYY-MM-DD`, Asia/Dhaka local |
| `meals` | **numeric(10,2)** = 0 | decimals allowed: 0.5, 1.5, 2.25 |
| `note`, `created_by` | text `''` | |
| `created_at`, `updated_at` | timestamptz | |

`UNIQUE daily_meals_month_member_day_uq(month_id, member_id, day)` — **one row per member per day**, so `meals.saveDay` upserts instead of duplicating. `meals = 0` deletes the row.
`INDEX daily_meals_month_day_idx(month_id, day)` · `daily_meals_office_idx(office_id)`

### `bazar_expenses`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `bzr_…` |
| `office_id`, `month_id` | text NOT NULL | |
| `date` | date NOT NULL | must be inside the month |
| `day` | int NOT NULL | derived from `date` |
| `member_id` | text NULL | who did the shopping (optional) |
| `buyer_name` | text `''` | free-text fallback |
| `category` | `bazar_category` = `Groceries` | UI-তে আর নেওয়া হয় না |
| `items_json` | text `'[]'` | আইটেম পপআপের লাইন `[{item,qty,price}]` |
| `items` | text `''` | e.g. `চাল, ডাল, তেল` |
| `amount` | numeric(14,2) = 0 | must be > 0 |
| `note`, `created_by` | text `''` | |
| `created_at`, `updated_at` | timestamptz | |

`INDEX bazar_month_idx(month_id)` · `bazar_month_date_idx(month_id, date)` · `bazar_office_idx(office_id)`

### `deposits`  (member fund / permanent fund)
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `dep_…` |
| `office_id`, `month_id` | text NOT NULL | |
| `date` | date NOT NULL | inside the month |
| `day` | int NOT NULL | |
| `member_id` | text NULL | |
| `member_name` | text `''` | kept so deleted members' history stays readable |
| `amount` | numeric(14,2) = 0 | |
| `type` | text = `permanent_fund` | `permanent_fund` (স্থায়ী তহবিল) / `member_deposit` / `closing_payment` (মাস-শেষ পরিশোধ) / `adjustment` / `jer_payment` (জেরের নগদ — দেনা-পাওনায় ধরে না) / `refund` |
| `note`, `created_by` | text `''` | |
| `created_at`, `updated_at` | timestamptz | |

`INDEX deposits_month_idx`, `deposits_member_idx`, `deposits_office_idx`

> **Rules 1 & 2:** `permanent_fund` totals are reported in their own column (`PermanentFund`) and are **never** subtracted from `TotalCost`.

### `other_incomes`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `inc_…` |
| `office_id`, `month_id`, `date`, `day` | as above | |
| `title` | text `''` | e.g. `পুরনো বাসন বিক্রি` |
| `amount` | numeric(14,2) = 0 | reduces the meal rate |
| `note`, `created_by` | text `''` | |
| `created_at`, `updated_at` | timestamptz | |

### `extra_expenses`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `ext_…` |
| `office_id`, `month_id`, `date`, `day` | as above | |
| `title` | text `''` | |
| `amount` | numeric(14,2) = 0 | |
| `type` | `extra_type` = `shared` | `shared` → split equally among **active** members · `individual` → only `member_id` |
| `member_id` | text NULL | **required when `type = individual`** (enforced in code) |
| `member_name`, `note`, `created_by` | text `''` | |
| `created_at`, `updated_at` | timestamptz | |

### `sync_logs`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `sync_…` |
| `office_id` | text NOT NULL | |
| `month_id` | text `''` | |
| `action` | text = `sync` | `sync` / `ping` / `pull` |
| `trigger` | text = `manual` | `manual` / `auto` |
| `ok` | bool = false | |
| `message` | text `''` | Apps Script reply or the failure reason |
| `sheet_url`, `sheet_id` | text `''` | |
| `duration_ms`, `payload_size` | int = 0 | |
| `user_id` | text `''` | who triggered it |
| `at` | timestamptz | |

Every sync attempt is logged — success **and** failure — so a broken Apps Script URL is diagnosable from the UI (Google Sheet tab → সাম্প্রতিক সিঙ্ক লগ).

### `audit_logs`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `aud_…` |
| `at` | timestamptz | |
| `user_id`, `user_name`, `role` | text `''` | |
| `office_id`, `month_id` | text `''` | |
| `action` | text NOT NULL | e.g. `bazar.create`, `month.open`, `admin.user.status` |
| `entity`, `entity_id` | text `''` | |
| `ok` | bool = true | failures are logged too |
| `message` | text `''` | human readable, Bengali |
| `meta` | **jsonb** NULL | extra context (deleted office snapshot, etc.) |
| `ip` | text `''` | |

Append-only; readable by `admin` and `audit` roles only.

### `settings`
| Column | Type | Notes |
|---|---|---|
| `key` | text PK | |
| `value` | text `''` | |
| `office_id` | text NULL | NULL = global |
| `updated_at` | timestamptz | |

Key/value store for office-level preferences (theme default, sheet options, custom labels).

---

## 4 · Constraints ↔ business rules

| Rule (spec §121) | Where it is enforced |
|---|---|
| 1 · Permanent fund is separate | `deposits.type = 'permanent_fund'` + its own report/sheet column |
| 2 · Fund never deducted from meal charge | `src/lib/calc.ts` — `totalCost` excludes `permanentFund` (E2E asserted) |
| 3 · `MealRate = (TotalBazar − OtherIncome) / TotalMeals` | `src/lib/calc.ts` `computeMealRate()` |
| 4 · Individual extra → that member only | `extra_expenses.type='individual'` + `member_id` NOT NULL check |
| 5 · Shared extra → equal split among active members | `calc.ts` divides by `activeMembers` (`members.is_active = true`) |
| 6 · Office isolation | `office_id` on every table + `WHERE office_id = …` in every query + 403 on cross-office monthId |
| 7 · Month isolation | `month_id` everywhere + `UNIQUE(office_id, year, month)` |
| 8 · Previous months stay viewable | `month.open` INSERTs a new row; `is_closed` blocks writes, never reads |
| one meal row per member per day | `UNIQUE(month_id, member_id, day)` + upsert in `saveDayMeals()` |
| one member per phone per month | `UNIQUE(month_id, phone)` |
| hashed passwords | `bcryptjs` cost 10 in `src/lib/password.ts` |
| cookie sessions with a table | `sessions` + `src/lib/auth.ts` |
| dates are local-safe | `date` columns + `src/lib/date.ts` forces `Asia/Dhaka`, stored as `YYYY-MM-DD` |

---

## 5 · Money & number precision

| Kind | Column type | Why |
|---|---|---|
| money | `numeric(14,2)` | exact decimal arithmetic — no float drift on ৳ |
| meals | `numeric(10,2)` | half meals (0.5 / 1.5) are normal |
| meal rate | computed, rounded to 2 dp for display | raw value kept in the calculation, `round2()` only at the DTO/sheet boundary |

All totals are computed in TypeScript from the exact DB values, then rounded **once** for display — never rounded mid-calculation.

---

## 6 · Seed data (`npm run db:seed`)

Idempotent — re-running updates instead of duplicating.

| Item | Count |
|---|---|
| offices | 3 (Gobra Mess, Barishal Head Office Mess, Dhaka Branch Mess) |
| users | 9 (1 platform admin, 3 managers, members, 1 audit, 1 pending) |
| months | 6 (previous **closed** + current, per office) |
| members | 26 |
| meal entries | 495 |
| bazar entries | 69 |
| deposits / incomes / extras | generated per month |

Login credentials are printed by the seeder (also listed in the README). **Change them before production.**

---

## 7 · Useful SQL

```sql
-- current month of every office
SELECT o.name, m.id, m.month_name, m.is_closed
FROM offices o JOIN mess_months m ON m.office_id = o.id
ORDER BY o.name, m.year DESC, m.month DESC;

-- meal total per member for a month
SELECT mem.name, COALESCE(SUM(dm.meals), 0) AS meals
FROM members mem
LEFT JOIN daily_meals dm ON dm.member_id = mem.id AND dm.month_id = mem.month_id
WHERE mem.month_id = 'office_gobra-2026-09'
GROUP BY mem.name ORDER BY meals DESC;

-- bazar vs other income (the meal rate numerator)
SELECT
  (SELECT COALESCE(SUM(amount),0) FROM bazar_expenses  WHERE month_id = 'office_gobra-2026-09') AS total_bazar,
  (SELECT COALESCE(SUM(amount),0) FROM other_incomes   WHERE month_id = 'office_gobra-2026-09') AS other_income,
  (SELECT COALESCE(SUM(meals),0)  FROM daily_meals     WHERE month_id = 'office_gobra-2026-09') AS total_meals;

-- failed sheet syncs
SELECT at, office_id, month_id, message, duration_ms
FROM sync_logs WHERE ok = false ORDER BY at DESC LIMIT 20;

-- audit trail for one member
SELECT at, user_name, role, action, message FROM audit_logs
WHERE office_id = 'office_gobra' ORDER BY at DESC LIMIT 50;
```
