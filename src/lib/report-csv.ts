/**
 * CSV export (spec §43) + the data layer for the printable PDF report (spec §42).
 * Server-side, office-isolated, permission-checked.
 */
import { round2, toNumber } from "@/lib/format";
import { toDisplayDate, toDisplayDateTime, monthLabelBn } from "@/lib/date";
import type {
  BazarDTO,
  DepositDTO,
  ExtraDTO,
  IncomeDTO,
  MealRowDTO,
  MessData,
  MonthSummary,
  OfficeDTO,
} from "@/lib/types";

/* ────────────────────────────────────────────────────────────
 *  CSV primitives
 * ──────────────────────────────────────────────────────────── */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? String(round2(value)) : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: (string | number)[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\r\n");
}

/** UTF-8 BOM so Excel opens Bangla correctly */
export function csvBlobParts(csv: string): string {
  return `\uFEFF${csv}`;
}

/* ────────────────────────────────────────────────────────────
 *  report CSVs
 * ──────────────────────────────────────────────────────────── */

export interface CsvContext {
  office: OfficeDTO;
  data: MessData;
  summary: MonthSummary;
  fromDate?: string | null;
  toDate?: string | null;
}

export function memberSummaryCsv({ data, summary }: CsvContext): string {
  // সদস্যভিত্তিক প্রকৃত নগদ জমা — ফান্ড ও সিস্টেম ক্যারি-ফরোয়ার্ড বাদ
  const cashByMember = new Map<string, number>();
  for (const d of data.deposits) {
    if (!d.memberId || d.type === "permanent_fund") continue;
    if ((d.createdBy ?? "") === "system:carry-forward") continue;
    const sign = d.type === "refund" ? -1 : 1;
    cashByMember.set(d.memberId, (cashByMember.get(d.memberId) ?? 0) + sign * Number(d.amount));
  }
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return toCsv(
    [
      "MemberID",
      "Name",
      "Role",
      "Phone",
      "Active",
      "TotalMeals",
      "MealRate",
      "MealCost",
      "IndividualExtra",
      "SharedExtra",
      "OpeningDue",
      "TotalCost",
      "SelfPaidBazarCredit",
      "JerSettled",
      "RemainingJer",
      "CashPaid",
      "DenaPoana",
      "PermanentFund",
      "Status",
      "MonthID",
    ],
    summary.memberCalculations.map((m) => {
      const paid = round(cashByMember.get(m.memberId) ?? 0);
      return [
        m.memberId,
        m.name,
        m.role,
        m.phone,
        m.isActive ? "Yes" : "No",
        m.totalMill,
        m.perMillRate,
        m.mealCost,
        m.individualExtra,
        m.sharedExtra,
        m.openingDue ?? 0,
        m.totalCost,
        m.selfPaidCredit ?? 0,
        (m.jerAdjusted ?? 0) + (m.jerCashPaid ?? 0),
        m.remainingJer ?? 0,
        paid,
        m.denaPoana,
        m.permanentFund,
        `${m.status}/${m.statusEn}`,
        data.id,
      ];
    }),
  );
}

export function mealsCsv({ data }: CsvContext): string {
  return toCsv(
    ["MonthID", "Year", "Month", "Day", "Date", "MemberID", "MemberName", "Meals"],
    [...data.dailyMeals]
      .sort((a, b) => a.day - b.day || a.memberName.localeCompare(b.memberName))
      .map((r: MealRowDTO) => [data.id, data.year, data.month, r.day, toDisplayDate(r.date), r.memberId, r.memberName, r.meals]),
  );
}

export function bazarCsv({ data }: CsvContext): string {
  return toCsv(
    ["EntryID", "MonthID", "Date", "Day", "BuyerName", "Category", "Items", "Amount", "Note"],
    [...data.bazarExpenses]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r: BazarDTO) => [r.id, data.id, toDisplayDate(r.date), r.day, r.buyerName, r.category, r.items, r.amount, r.note]),
  );
}

export function depositsCsv({ data }: CsvContext): string {
  return toCsv(
    ["EntryID", "MonthID", "Date", "Day", "MemberID", "MemberName", "Amount", "Type", "Note"],
    [...data.deposits]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r: DepositDTO) => [r.id, data.id, toDisplayDate(r.date), r.day, r.memberId ?? "", r.memberName, r.amount, r.type, r.note]),
  );
}

export function incomesCsv({ data }: CsvContext): string {
  return toCsv(
    ["EntryID", "MonthID", "Date", "Day", "Title", "Amount", "Note"],
    [...data.otherIncomes]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r: IncomeDTO) => [r.id, data.id, toDisplayDate(r.date), r.day, r.title, r.amount, r.note]),
  );
}

export function extrasCsv({ data }: CsvContext): string {
  return toCsv(
    ["EntryID", "MonthID", "Date", "Day", "Title", "Type", "MemberName", "Amount", "Note"],
    [...data.extraExpenses]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r: ExtraDTO) => [r.id, data.id, toDisplayDate(r.date), r.day, r.title, r.type, r.memberName, r.amount, r.note]),
  );
}

/** One CSV per section, joined by section banners — mirrors the Google Sheet tabs. */
export function fullReportCsv(ctx: CsvContext): string {
  const { office, data, summary } = ctx;
  const out: string[] = [];

  out.push(
    toCsv(
      ["Mess Meal Manager — Full Report"],
      [
        [`Office,${office.name}`],
        [`Branch,${office.branch}`],
        [`Office Code,${office.code}`],
        [`Month,${data.monthName} (${monthLabelBn(data.year, data.month)})`],
        [`MonthID,${data.id}`],
        [`Date Range,${ctx.fromDate ? toDisplayDate(ctx.fromDate) : "01"} – ${ctx.toDate ? toDisplayDate(ctx.toDate) : "end of month"}`],
        [`Generated At,${toDisplayDateTime(new Date().toISOString())}`],
      ],
    ),
  );

  out.push(
    toCsv(
      ["Summary"],
      [
        ["Total Members (active)", summary.activeMembers],
        ["Total Meals", summary.totalMill],
        ["Total Bazar", summary.totalBazarCost],
        ["Fund Paid Bazar", summary.fundPaidBazar ?? summary.totalBazarCost - (summary.totalSelfPaidBazar ?? 0)],
        ["Self Paid Bazar", summary.totalSelfPaidBazar],
        ["Other Income", summary.totalOthersIncome],
        ["Net Meal Cost", summary.netCost],
        ["Meal Rate", summary.perMillRate],
        ["Permanent Fund", summary.totalFund],
        ["Shared Extra", summary.totalSharedExtra],
        ["Individual Extra", summary.totalIndividualExtra],
        ["Last Balance", summary.lastBalance],
      ],
    ),
  );

  out.push(memberSummaryCsv(ctx));
  out.push(mealsCsv(ctx));
  out.push(bazarCsv(ctx));
  out.push(depositsCsv(ctx));
  out.push(incomesCsv(ctx));
  out.push(extrasCsv(ctx));

  return out.join("\r\n\r\n");
}

export const CSV_VARIANTS = {
  full: { label: "সম্পূর্ণ রিপোর্ট (Full Report)", build: fullReportCsv },
  members: { label: "সদস্য হিসাব (Member Summary)", build: memberSummaryCsv },
  meals: { label: "দৈনিক মিল (Meals)", build: mealsCsv },
  bazar: { label: "বাজার খরচ (Bazar)", build: bazarCsv },
  deposits: { label: "জমা ও তহবিল (Fund)", build: depositsCsv },
  incomes: { label: "অন্যান্য আয় (Other Income)", build: incomesCsv },
  extras: { label: "অতিরিক্ত খরচ (Extras)", build: extrasCsv },
} as const;

export type CsvVariant = keyof typeof CSV_VARIANTS;

export function buildCsv(variant: string, ctx: CsvContext): string {
  const entry = CSV_VARIANTS[variant as CsvVariant] ?? CSV_VARIANTS.full;
  return entry.build(ctx);
}

export function csvFilename(office: OfficeDTO, data: MessData, variant: string): string {
  const safe = `${office.name}-${data.year}-${String(data.month).padStart(2, "0")}-${variant}`
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${safe}.csv`;
}

export { toNumber };
