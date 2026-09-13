import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────
 *  ENUMS
 * ──────────────────────────────────────────────────────────── */

export const roleEnum = pgEnum("role", ["admin", "manager", "member", "audit"]);

export const userStatusEnum = pgEnum("user_status", [
  "pending",
  "approved",
  "rejected",
  "inactive",
  "active",
]);

export const officeStatusEnum = pgEnum("office_status", [
  "pending",
  "approved",
  "active",
  "inactive",
]);

export const bazarCategoryEnum = pgEnum("bazar_category", [
  "Groceries",
  "Vegetables",
  "Meat",
  "Fish",
  "Rice",
  "Oil",
  "Spices",
  "Other",
]);

export const extraTypeEnum = pgEnum("extra_type", ["shared", "individual"]);

/* ────────────────────────────────────────────────────────────
 *  OFFICES  — every office is a fully isolated tenant
 *  id is a readable slug, e.g. "office_gobra"
 * ──────────────────────────────────────────────────────────── */

export const offices = pgTable(
  "offices",
  {
    id: text("id").primaryKey(), // office_gobra
    name: text("name").notNull(),
    branch: text("branch").notNull().default(""),
    code: text("code").notNull(), // GOBRA01
    managerName: text("manager_name").notNull().default(""),
    managerEmail: text("manager_email").notNull().default(""),
    managerPhone: text("manager_phone").notNull().default(""),
    status: officeStatusEnum("status").notNull().default("active"),
    isDefault: boolean("is_default").notNull().default(false),
    sheetUrl: text("sheet_url").notNull().default(""),
    sheetId: text("sheet_id").notNull().default(""),
    scriptUrl: text("script_url").notNull().default(""),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    address: text("address").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("offices_code_uq").on(t.code), index("offices_status_idx").on(t.status)],
);

/* ────────────────────────────────────────────────────────────
 *  USERS  — login accounts. Always bound to an office
 *  (platform admins have officeId = null and may switch office)
 * ──────────────────────────────────────────────────────────── */

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => cryptoId("user")),
    userId: text("user_id").notNull(), // login id / mobile number
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    branch: text("branch").notNull().default(""),
    officeId: text("office_id").references((): AnyPgColumn => offices.id, {
      onDelete: "cascade",
    }),
    role: roleEnum("role").notNull().default("member"),
    status: userStatusEnum("status").notNull().default("pending"),
    password: text("password").notNull(), // bcrypt hash — never plain text
    lastLogin: timestamp("last_login", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_user_id_uq").on(t.userId),
    index("users_office_idx").on(t.officeId),
    index("users_phone_idx").on(t.phone),
  ],
);

/* ────────────────────────────────────────────────────────────
 *  SESSIONS  — secure, DB-backed sessions
 * ──────────────────────────────────────────────────────────── */

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // opaque random token
    userId: text("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    officeId: text("office_id"),
    /** Office selected by a platform admin through the office switcher */
    currentOfficeId: text("current_office_id"),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

/* ────────────────────────────────────────────────────────────
 *  MESS MONTHS  — one accounting period per office per month
 *  id = `${officeId}-${year}-${month}`  e.g. office_gobra-2026-09
 * ──────────────────────────────────────────────────────────── */

export const messMonths = pgTable(
  "mess_months",
  {
    id: text("id").primaryKey(),
    officeId: text("office_id")
      .notNull()
      .references((): AnyPgColumn => offices.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1..12
    monthName: text("month_name").notNull(),
    totalDays: integer("total_days").notNull(),
    /** closing a month blocks writes for managers; admins may still edit */
    isClosed: boolean("is_closed").notNull().default(false),
    carryForwardBalance: numeric("carry_forward_balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mess_months_office_year_month_uq").on(t.officeId, t.year, t.month),
    index("mess_months_office_idx").on(t.officeId),
  ],
);

/* ────────────────────────────────────────────────────────────
 *  MEMBERS  — per office, per month (month roster)
 * ──────────────────────────────────────────────────────────── */

export const members = pgTable(
  "members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => cryptoId("mem")),
    officeId: text("office_id")
      .notNull()
      .references((): AnyPgColumn => offices.id, { onDelete: "cascade" }),
    monthId: text("month_id")
      .notNull()
      .references((): AnyPgColumn => messMonths.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull().default("member"), // member | manager | audit | guest
    isActive: boolean("is_active").notNull().default(true),
    phone: text("phone").notNull().default(""),
    password: text("password").notNull().default(""), // optional legacy/demo field, hashed
    room: text("room").notNull().default(""),
    note: text("note").notNull().default(""),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("members_month_phone_uq").on(t.monthId, t.phone),
    index("members_office_idx").on(t.officeId),
    index("members_month_idx").on(t.monthId),
  ],
);

/* ────────────────────────────────────────────────────────────
 *  DAILY MEALS  — unique (monthId, memberId, day)
 * ──────────────────────────────────────────────────────────── */

export const dailyMeals = pgTable(
  "daily_meals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => cryptoId("meal")),
    officeId: text("office_id")
      .notNull()
      .references((): AnyPgColumn => offices.id, { onDelete: "cascade" }),
    monthId: text("month_id")
      .notNull()
      .references((): AnyPgColumn => messMonths.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references((): AnyPgColumn => members.id, { onDelete: "cascade" }),
    day: integer("day").notNull(), // 1..31
    date: date("date").notNull(), // YYYY-MM-DD (local-safe, never a timestamp)
    meals: numeric("meals", { precision: 10, scale: 2 }).notNull().default("0"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("daily_meals_month_member_day_uq").on(t.monthId, t.memberId, t.day),
    index("daily_meals_month_day_idx").on(t.monthId, t.day),
    index("daily_meals_office_idx").on(t.officeId),
  ],
);

/* ────────────────────────────────────────────────────────────
 *  BAZAR / MARKET EXPENSES
 * ──────────────────────────────────────────────────────────── */

export const bazarExpenses = pgTable(
  "bazar_expenses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => cryptoId("bzr")),
    officeId: text("office_id")
      .notNull()
      .references((): AnyPgColumn => offices.id, { onDelete: "cascade" }),
    monthId: text("month_id")
      .notNull()
      .references((): AnyPgColumn => messMonths.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    day: integer("day").notNull(),
    memberId: text("member_id"),
    buyerName: text("buyer_name").notNull().default(""),
    category: bazarCategoryEnum("category").notNull().default("Groceries"),
    items: text("items").notNull().default(""),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bazar_month_idx").on(t.monthId),
    index("bazar_month_date_idx").on(t.monthId, t.date),
    index("bazar_office_idx").on(t.officeId),
  ],
);

/* ────────────────────────────────────────────────────────────
 *  DEPOSITS / PERMANENT FUND
 *  type = permanent_fund  →  permanent capital.
 *  It is NEVER deducted from the monthly meal charge.
 * ──────────────────────────────────────────────────────────── */

export const deposits = pgTable(
  "deposits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => cryptoId("dep")),
    officeId: text("office_id")
      .notNull()
      .references((): AnyPgColumn => offices.id, { onDelete: "cascade" }),
    monthId: text("month_id")
      .notNull()
      .references((): AnyPgColumn => messMonths.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    day: integer("day").notNull(),
    memberId: text("member_id").references((): AnyPgColumn => members.id, {
      onDelete: "set null",
    }),
    memberName: text("member_name").notNull().default(""),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    note: text("note").notNull().default(""),
    type: text("type").notNull().default("permanent_fund"), // permanent_fund | refund | adjustment
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deposits_month_idx").on(t.monthId),
    index("deposits_member_idx").on(t.memberId),
    index("deposits_office_idx").on(t.officeId),
  ],
);

/* ────────────────────────────────────────────────────────────
 *  OTHER INCOME  — reduces the net meal cost
 * ──────────────────────────────────────────────────────────── */

export const otherIncomes = pgTable(
  "other_incomes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => cryptoId("inc")),
    officeId: text("office_id")
      .notNull()
      .references((): AnyPgColumn => offices.id, { onDelete: "cascade" }),
    monthId: text("month_id")
      .notNull()
      .references((): AnyPgColumn => messMonths.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    day: integer("day").notNull(),
    title: text("title").notNull().default(""),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("income_month_idx").on(t.monthId), index("income_office_idx").on(t.officeId)],
);

/* ────────────────────────────────────────────────────────────
 *  EXTRA EXPENSES  — shared (÷ active members) or individual
 * ──────────────────────────────────────────────────────────── */

export const extraExpenses = pgTable(
  "extra_expenses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => cryptoId("ext")),
    officeId: text("office_id")
      .notNull()
      .references((): AnyPgColumn => offices.id, { onDelete: "cascade" }),
    monthId: text("month_id")
      .notNull()
      .references((): AnyPgColumn => messMonths.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    day: integer("day").notNull(),
    title: text("title").notNull().default(""),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    type: extraTypeEnum("type").notNull().default("shared"),
    memberId: text("member_id").references((): AnyPgColumn => members.id, {
      onDelete: "set null",
    }),
    memberName: text("member_name").notNull().default(""),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("extra_month_idx").on(t.monthId), index("extra_office_idx").on(t.officeId)],
);

/* ────────────────────────────────────────────────────────────
 *  GOOGLE SHEETS SYNC LOG
 * ──────────────────────────────────────────────────────────── */

export const syncLogs = pgTable(
  "sync_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => cryptoId("sync")),
    officeId: text("office_id").notNull(),
    monthId: text("month_id").notNull().default(""),
    action: text("action").notNull().default("sync"),
    trigger: text("trigger").notNull().default("manual"), // manual | auto
    ok: boolean("ok").notNull().default(false),
    message: text("message").notNull().default(""),
    sheetUrl: text("sheet_url").notNull().default(""),
    sheetId: text("sheet_id").notNull().default(""),
    durationMs: integer("duration_ms").notNull().default(0),
    payloadSize: integer("payload_size").notNull().default(0),
    userId: text("user_id").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sync_logs_office_idx").on(t.officeId, t.at)],
);

/* ────────────────────────────────────────────────────────────
 *  AUDIT TRAIL
 * ──────────────────────────────────────────────────────────── */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => cryptoId("aud")),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    userId: text("user_id").notNull().default(""),
    userName: text("user_name").notNull().default(""),
    role: text("role").notNull().default(""),
    officeId: text("office_id").notNull().default(""),
    monthId: text("month_id").notNull().default(""),
    action: text("action").notNull(),
    entity: text("entity").notNull().default(""),
    entityId: text("entity_id").notNull().default(""),
    ok: boolean("ok").notNull().default(true),
    message: text("message").notNull().default(""),
    meta: jsonb("meta"),
    ip: text("ip").notNull().default(""),
  },
  (t) => [index("audit_logs_office_idx").on(t.officeId, t.at), index("audit_logs_user_idx").on(t.userId)],
);

/* ────────────────────────────────────────────────────────────
 *  KEY / VALUE SETTINGS (platform + per office)
 * ──────────────────────────────────────────────────────────── */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  officeId: text("office_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ────────────────────────────────────────────────────────────
 *  helpers
 * ──────────────────────────────────────────────────────────── */

export function cryptoId(prefix: string): string {
  const rnd =
    typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${rnd}`;
}

/* ────────────────────────────────────────────────────────────
 *  inferred types
 * ──────────────────────────────────────────────────────────── */

export type Office = typeof offices.$inferSelect;
export type OfficeInsert = typeof offices.$inferInsert;
export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type MessMonth = typeof messMonths.$inferSelect;
export type Member = typeof members.$inferSelect;
export type MemberInsert = typeof members.$inferInsert;
export type DailyMeal = typeof dailyMeals.$inferSelect;
export type BazarExpense = typeof bazarExpenses.$inferSelect;
export type Deposit = typeof deposits.$inferSelect;
export type OtherIncome = typeof otherIncomes.$inferSelect;
export type ExtraExpense = typeof extraExpenses.$inferSelect;
export type SyncLog = typeof syncLogs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

export type Role = "admin" | "manager" | "member" | "audit";
export type UserStatus = "pending" | "approved" | "rejected" | "inactive" | "active";
export type OfficeStatus = "pending" | "approved" | "active" | "inactive";
export type BazarCategory =
  | "Groceries"
  | "Vegetables"
  | "Meat"
  | "Fish"
  | "Rice"
  | "Oil"
  | "Spices"
  | "Other";
export type ExtraType = "shared" | "individual";
