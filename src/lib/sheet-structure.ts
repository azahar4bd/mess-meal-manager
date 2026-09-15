/**
 * ══════════════════════════════════════════════════════════════
 *  GOOGLE SHEET STRUCTURE  (spec §46–§54)
 *
 *  Exact tab names (Bangla) and exact column order.
 *  This file is the single source of truth shared by:
 *    • src/lib/sheets.ts        (payload builder)
 *    • google-apps-script/Code.gs (writer)
 *    • docs/GOOGLE_SHEET_STRUCTURE.md
 * ══════════════════════════════════════════════════════════════
 */

export const SHEET_TABS = {
  OFFICE_INFO: "00_অফিস_ইনফো",
  MEMBERS: "01_সদস্য_তালিকা",
  MEALS: "02_দৈনিক_মিল_খাতা",
  BAZAR: "03_বাজার_খরচ",
  DEPOSITS: "04_জমা_ও_তহবিল",
  INCOME: "05_অন্যান্য_আয়",
  SUMMARY: "06_হিসাব_সামারি",
  DENA_PAONA: "07_দেনা_পাওনা",
} as const;

export type SheetTabKey = keyof typeof SHEET_TABS;

/** canonical tab order — Apps Script creates missing tabs in this order */
export const SHEET_TAB_ORDER: string[] = [
  SHEET_TABS.OFFICE_INFO,
  SHEET_TABS.MEMBERS,
  SHEET_TABS.MEALS,
  SHEET_TABS.BAZAR,
  SHEET_TABS.DEPOSITS,
  SHEET_TABS.INCOME,
  SHEET_TABS.SUMMARY,
  SHEET_TABS.DENA_PAONA,
];

/** logical sheet names accepted by `?action=pull&sheetName=Meals` */
export const SHEET_ALIAS: Record<string, string> = {
  office: SHEET_TABS.OFFICE_INFO,
  officeinfo: SHEET_TABS.OFFICE_INFO,
  "00": SHEET_TABS.OFFICE_INFO,
  members: SHEET_TABS.MEMBERS,
  member: SHEET_TABS.MEMBERS,
  "01": SHEET_TABS.MEMBERS,
  meals: SHEET_TABS.MEALS,
  meal: SHEET_TABS.MEALS,
  mill: SHEET_TABS.MEALS,
  "02": SHEET_TABS.MEALS,
  bazar: SHEET_TABS.BAZAR,
  market: SHEET_TABS.BAZAR,
  "03": SHEET_TABS.BAZAR,
  deposits: SHEET_TABS.DEPOSITS,
  deposit: SHEET_TABS.DEPOSITS,
  fund: SHEET_TABS.DEPOSITS,
  "04": SHEET_TABS.DEPOSITS,
  income: SHEET_TABS.INCOME,
  otherincome: SHEET_TABS.INCOME,
  "05": SHEET_TABS.INCOME,
  summary: SHEET_TABS.SUMMARY,
  "06": SHEET_TABS.SUMMARY,
  denapaona: SHEET_TABS.DENA_PAONA,
  "dena-poana": SHEET_TABS.DENA_PAONA,
  "07": SHEET_TABS.DENA_PAONA,
};

export const COLUMNS = {
  officeInfo: ["Key", "Value"],
  members: ["MemberID", "Name", "Role", "Phone", "IsActive", "OfficeID", "MonthID"],
  meals: ["MonthID", "Year", "Month", "Day", "Date", "MemberID", "MemberName", "Meals"],
  bazar: [
    "EntryID",
    "MonthID",
    "Date",
    "Day",
    "MemberID",
    "BuyerName",
    "Category",
    "Items",
    "Amount",
    "Note",
  ],
  deposits: ["EntryID", "MonthID", "Date", "Day", "MemberID", "MemberName", "Amount", "Note", "Type"],
  income: ["EntryID", "MonthID", "Date", "Day", "Title", "Amount", "Note"],
  summary: [
    "MonthID",
    "MonthName",
    "TotalMembers",
    "TotalMeals",
    "MealRate",
    "TotalBazar",
    "FundPaidBazar",
    "OtherIncome",
    "NetMealCost",
    "PermanentFund",
    "SharedExtra",
    "LastBalance",
    "SyncedAt",
  ],
  denaPoana: [
    "MonthID",
    "MemberID",
    "Name",
    "Role",
    "TotalMeals",
    "MealRate",
    "MealCost",
    "IndividualExtra",
    "SharedExtra",
    "TotalMealCost",
    "Deposits",
    "SelfPaidBazar",
    "DenaPoana",
    "PermanentFund",
    "Status",
  ],
} as const;

export const OFFICE_INFO_KEYS = [
  "OfficeID",
  "OfficeName",
  "Branch",
  "OfficeCode",
  "ManagerName",
  "ManagerPhone",
  "ManagerEmail",
  "SheetURL",
  "MonthID",
  "MonthName",
  "Year",
  "Month",
  "TotalDays",
  "SyncedAt",
] as const;

export interface SheetBlock {
  name: string;
  headers: readonly string[];
  rows: (string | number)[][];
}

export interface SyncPayload {
  ok: true;
  action: "sync";
  version: number;
  syncedAt: string;
  office: {
    id: string;
    name: string;
    branch: string;
    code: string;
    managerName: string;
    managerPhone: string;
    managerEmail: string;
    sheetUrl: string;
    sheetId: string;
  };
  month: {
    id: string;
    name: string;
    year: number;
    month: number;
    totalDays: number;
  };
  sheets: SheetBlock[];
}

export const SYNC_PAYLOAD_VERSION = 1;
