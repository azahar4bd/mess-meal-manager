/**
 * Local-safe date handling (spec §92, §93).
 *
 * The whole app works in Asia/Dhaka local time and stores calendar dates as
 * plain `YYYY-MM-DD` strings / `date` columns — never as UTC timestamps — so a
 * browser in another timezone can never shift a meal to the previous/next day.
 */

export const APP_TIMEZONE = "Asia/Dhaka";

export const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const MONTH_NAMES_BN = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

const WEEK_DAYS_BN = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];

/** গ্রিড/সংক্ষিপ্ত স্থানের জন্য সুন্দর দুই-তিন অক্ষরের বারের নাম */
const WEEK_DAYS_BN_SHORT = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Current year/month/day in Asia/Dhaka, independent of server timezone. */
export function dhakaNow(): { year: number; month: number; day: number; iso: string; date: Date } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const iso = fmt.format(now); // YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d, iso, date: now };
}

export function todayIso(): string {
  return dhakaNow().iso;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildMonthId(officeId: string, year: number, month: number): string {
  return `${officeId}-${year}-${pad2(month)}`;
}

export function parseMonthId(monthId: string): { officeId: string; year: number; month: number } | null {
  const m = /^(.+)-(\d{4})-(\d{2})$/.exec(monthId);
  if (!m) return null;
  return { officeId: m[1], year: Number(m[2]), month: Number(m[3]) };
}

export function monthNameEn(month: number): string {
  return MONTH_NAMES_EN[(month - 1 + 12) % 12] ?? "";
}

export function monthNameBn(month: number): string {
  return MONTH_NAMES_BN[(month - 1 + 12) % 12] ?? "";
}

export function monthLabel(year: number, month: number): string {
  return `${monthNameEn(month)} ${year}`;
}

export function monthLabelBn(year: number, month: number): string {
  return `${monthNameBn(month)} ${year}`;
}

/** Accepts `YYYY-MM-DD`, `D-M-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DDTHH:mm...` → `YYYY-MM-DD` */
export function toIsoDate(input: string | Date | null | undefined, fallback?: string): string {
  if (!input) return fallback ?? todayIso();
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return fallback ?? todayIso();
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(input.getDate())}`;
  }
  const s = String(input).trim();
  if (!s) return fallback ?? todayIso();

  // ISO / ISO-with-time — take the calendar part literally (no timezone shift)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // D-M-YYYY / DD/MM/YYYY / D.M.YYYY
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${pad2(Number(dmy[2]))}-${pad2(Number(dmy[1]))}`;

  // YYYY/MM/DD
  const ymd = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s);
  if (ymd) return `${ymd[1]}-${pad2(Number(ymd[2]))}-${pad2(Number(ymd[3]))}`;

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }
  return fallback ?? todayIso();
}

export function isoParts(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function dayOfIso(iso: string): number {
  return isoParts(iso).day;
}

export function monthIndexOfIso(iso: string): number {
  return isoParts(iso).month;
}

/** `2026-09-11` → `11-09-2026` (the format used across the UI) */
export function toDisplayDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

export function toDisplayDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: APP_TIMEZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function weekdayBn(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return WEEK_DAYS_BN[dt.getUTCDay()] ?? "";
}

/** সংক্ষিপ্ত বারের নাম: রবি, সোম, মঙ্গল, বুধ, বৃহঃ, শুক্র, শনি */
export function weekdayBnShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return WEEK_DAYS_BN_SHORT[dt.getUTCDay()] ?? "";
}

/** ISO of a specific day inside a month */
export function isoOfDay(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function isValidIso(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const { year, month, day } = isoParts(iso);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** last N months up to the current Dhaka month (for the month selector) */
export function recentMonths(count = 14): { year: number; month: number }[] {
  const now = dhakaNow();
  const out: { year: number; month: number }[] = [];
  for (let i = 0; i < count; i++) out.push(addMonths(now.year, now.month, -i));
  return out;
}
