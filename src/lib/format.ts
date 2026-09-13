/** Number / text formatting helpers shared by server and client. */

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,৳\s]/g, "");
    if (!cleaned) return fallback;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }
  if (value && typeof value === "object" && "toString" in value) {
    const n = Number(String(value));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function round4(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}

/** 1234.5 → "1,234.50" */
export function formatMoney(n: number | string | null | undefined, digits = 2): string {
  const v = toNumber(n, 0);
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** compact: 1234567 → "12,34,567" style kept simple as 1,234,567 */
export function formatInt(n: number | string | null | undefined): string {
  return Math.round(toNumber(n, 0)).toLocaleString("en-US");
}

/** meal values may be fractional (0.5, 1.5) */
export function formatMeal(n: number | string | null | undefined): string {
  const v = toNumber(n, 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "");
}

export function formatRate(n: number | string | null | undefined): string {
  const v = toNumber(n, 0);
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 1234.5 → "১,২৩৪.৫" */
export function toBengaliDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

export function taka(n: number | string | null | undefined): string {
  return `৳ ${formatMoney(n)}`;
}

export function truncate(s: string, len = 40): string {
  if (!s) return "";
  return s.length > len ? `${s.slice(0, len - 1)}…` : s;
}

export function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return `${(parts[0] ?? "?").charAt(0)}${(parts[parts.length - 1] ?? "?").charAt(0)}`.toUpperCase();
}

export function mealSteps(): number[] {
  return [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
}
