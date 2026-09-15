import type { Role } from "./types";

/**
 * Permission matrix (spec §7).
 * `true` = allowed, `false` = denied. Enforced server-side on EVERY api call
 * (session → user → role → office → permission → database).
 */
export type Capability =
  | "dashboard.view"
  | "meals.view"
  | "meals.write"
  | "bazar.view"
  | "bazar.write"
  | "fund.view"
  | "fund.write"
  | "income.view"
  | "income.write"
  | "extras.view"
  | "extras.write"
  | "members.view"
  | "members.write"
  | "members.approve"
  | "report.view"
  | "report.export"
  | "sheet.view"
  | "sheet.sync"
  | "month.write"
  | "office.manage"
  | "user.manage"
  | "audit.view"
  | "guide.view"
  | "settings.write";

const MATRIX: Record<Role, Record<Capability, boolean>> = {
  /* ── Platform Admin: full control over everything (spec §7) ── */
  admin: {
    "dashboard.view": true,
    "meals.view": true,
    "meals.write": true,
    "bazar.view": true,
    "bazar.write": true,
    "fund.view": true,
    "fund.write": true,
    "income.view": true,
    "income.write": true,
    "extras.view": true,
    "extras.write": true,
    "members.view": true,
    "members.write": true,
    "members.approve": true,
    "report.view": true,
    "report.export": true,
    "sheet.view": true,
    "sheet.sync": true,
    "month.write": true,
    "office.manage": true,
    "user.manage": true,
    "audit.view": true,
    "guide.view": true,
    "settings.write": true,
  },

  /* ── Manager: everything inside OWN office only ─────────── */
  manager: {
    "dashboard.view": true,
    "meals.view": true,
    "meals.write": true,
    "bazar.view": true,
    "bazar.write": true,
    "fund.view": true,
    "fund.write": true,
    "income.view": true,
    "income.write": true,
    "extras.view": true,
    "extras.write": true,
    "members.view": true,
    "members.write": true,
    // spec §15 — the manager approves/rejects members of their own office
    "members.approve": true,
    "report.view": true,
    "report.export": true,
    // গুগল শিট সিংক স্বয়ংক্রিয় (সার্ভার-সাইড); ম্যানেজার প্যানেলে শিট ট্যাব দেখানো হয় না
    "sheet.view": false,
    "sheet.sync": false,
    "month.write": true,
    "office.manage": false,
    "user.manage": false,
    "audit.view": false,
    "guide.view": true,
    // হিরো/হেডার/ফুটার/নোটিশ — সব কন্টেন্ট এডিট শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিন
    "settings.write": false,
  },

  /* ── Member: Reports menu only (spec §7, §70) ───────────── */
  member: {
    "dashboard.view": false,
    "meals.view": false,
    "meals.write": false,
    "bazar.view": false,
    "bazar.write": false,
    "fund.view": false,
    "fund.write": false,
    "income.view": false,
    "income.write": false,
    "extras.view": false,
    "extras.write": false,
    "members.view": false,
    "members.write": false,
    "members.approve": false,
    "report.view": true,
    "report.export": true,
    "sheet.view": false,
    "sheet.sync": false,
    "month.write": false,
    "office.manage": false,
    "user.manage": false,
    "audit.view": false,
    "guide.view": true,
    "settings.write": false,
  },

  /* ── Audit: report-only access, zero modification rights ── */
  audit: {
    "dashboard.view": true,
    "meals.view": true,
    "meals.write": false,
    "bazar.view": true,
    "bazar.write": false,
    "fund.view": true,
    "fund.write": false,
    "income.view": true,
    "income.write": false,
    "extras.view": true,
    "extras.write": false,
    "members.view": true,
    "members.write": false,
    "members.approve": false,
    "report.view": true,
    "report.export": true,
    "sheet.view": false,
    "sheet.sync": false,
    "month.write": false,
    "office.manage": false,
    "user.manage": false,
    "audit.view": true,
    "guide.view": true,
    "settings.write": false,
  },
};

export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[role]?.[capability] === true;
}

/** Write capability required per entity — used by the /api/mess router. */
export const WRITE_CAPABILITY: Record<string, Capability> = {
  meal: "meals.write",
  bazar: "bazar.write",
  deposit: "fund.write",
  income: "income.write",
  extra: "extras.write",
  member: "members.write",
  month: "month.write",
  office: "office.manage",
  user: "user.manage",
  setting: "settings.write",
};

export const READ_CAPABILITY: Record<string, Capability> = {
  meal: "meals.view",
  bazar: "bazar.view",
  deposit: "fund.view",
  income: "income.view",
  extra: "extras.view",
  member: "members.view",
  month: "report.view",
  office: "office.manage",
  user: "user.manage",
  report: "report.view",
  sheet: "sheet.view",
  audit: "audit.view",
};

/** Default landing tab per role (spec §8). */
export const ROLE_HOME: Record<Role, string> = {
  admin: "dashboard",
  manager: "meals",
  member: "report",
  audit: "report",
};

/** Menu definition per role (spec §68–70). */
export interface MenuItem {
  tab: string;
  bn: string;
  en: string;
  icon: string;
  capability: Capability;
}

export const MENU: MenuItem[] = [
  { tab: "dashboard", bn: "ড্যাশবোর্ড", en: "Dashboard", icon: "▦", capability: "dashboard.view" },
  { tab: "meals", bn: "দৈনিক মিল", en: "Meals", icon: "🍚", capability: "meals.view" },
  { tab: "bazar", bn: "বাজার", en: "Bazar", icon: "🧺", capability: "bazar.view" },
  { tab: "fund", bn: "ফান্ড / জমা", en: "Fund", icon: "💰", capability: "fund.view" },
  { tab: "income", bn: "অন্যান্য আয়", en: "Other Income", icon: "➕", capability: "income.view" },
  { tab: "extras", bn: "অতিরিক্ত খরচ", en: "Extras", icon: "🧾", capability: "extras.view" },
  { tab: "members", bn: "সদস্য", en: "Members", icon: "👥", capability: "members.view" },
  { tab: "report", bn: "হিসাব / রিপোর্ট", en: "Reports", icon: "📊", capability: "report.view" },
  { tab: "sheet", bn: "গুগল শিট", en: "Google Sheet", icon: "☁", capability: "sheet.view" },
  { tab: "admin", bn: "অ্যাডমিন প্যানেল", en: "Admin", icon: "🛡", capability: "user.manage" },
  { tab: "guide", bn: "গাইড", en: "Guide", icon: "📘", capability: "guide.view" },
];

export function menuForRole(role: Role): MenuItem[] {
  return MENU.filter((m) => can(role, m.capability));
}

export const ROLE_LABEL: Record<Role, { bn: string; en: string }> = {
  admin: { bn: "অ্যাডমিন", en: "Admin" },
  manager: { bn: "ম্যানেজার", en: "Manager" },
  member: { bn: "সদস্য", en: "Member" },
  audit: { bn: "অডিট", en: "Audit" },
};
