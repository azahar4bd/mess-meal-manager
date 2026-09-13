/**
 * Dependency-free input validation (spec §119).
 * Every API handler validates its payload through these helpers before
 * anything touches the database.
 */

export class ValidationError extends Error {
  fields: Record<string, string>;
  status: number;
  constructor(message: string, fields: Record<string, string> = {}, status = 400) {
    super(message);
    this.name = "ValidationError";
    this.fields = fields;
    this.status = status;
  }
}

export type Errors = Record<string, string>;

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

export function str(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
}

export function requireString(v: unknown, field: string, errors: Errors, opts: { min?: number; max?: number } = {}): string {
  const s = str(v);
  if (!s) {
    errors[field] = `${field} আবশ্যক`;
    return "";
  }
  if (opts.min && s.length < opts.min) errors[field] = `কমপক্ষে ${opts.min} অক্ষর হতে হবে`;
  if (opts.max && s.length > opts.max) errors[field] = `সর্বোচ্চ ${opts.max} অক্ষর`;
  return s.slice(0, opts.max ?? 500);
}

export function optionalString(v: unknown, max = 500): string {
  return str(v).slice(0, max);
}

export function num(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const s = str(v).replace(/[,৳\s]/g, "");
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/** amount >= 0 */
export function requireAmount(v: unknown, field: string, errors: Errors, max = 10_000_000): number {
  const n = num(v, NaN);
  if (!Number.isFinite(n)) {
    errors[field] = "সঠিক পরিমাণ লিখুন";
    return 0;
  }
  if (n < 0) {
    errors[field] = "পরিমাণ ঋণাত্মক হতে পারবে না";
    return 0;
  }
  if (n > max) {
    errors[field] = `পরিমাণ সর্বোচ্চ ${max.toLocaleString("en-US")}`;
    return 0;
  }
  return Math.round(n * 100) / 100;
}

/** meal >= 0, decimal allowed (0.5 steps are the norm but any decimal is accepted) */
export function requireMeal(v: unknown, field: string, errors: Errors, max = 1000): number {
  const n = num(v, NaN);
  if (!Number.isFinite(n)) {
    errors[field] = "সঠিক মিল সংখ্যা লিখুন";
    return 0;
  }
  if (n < 0) {
    errors[field] = "মিল ঋণাত্মক হতে পারবে না";
    return 0;
  }
  if (n > max) {
    errors[field] = "মিল সংখ্যা অনেক বেশি";
    return 0;
  }
  return Math.round(n * 100) / 100;
}

export function requireDay(v: unknown, field: string, errors: Errors, totalDays: number): number {
  const n = Math.trunc(num(v, NaN));
  if (!Number.isFinite(n) || n < 1 || n > totalDays) {
    errors[field] = `দিন ১ থেকে ${totalDays} এর মধ্যে হতে হবে`;
    return 0;
  }
  return n;
}

const PHONE_RE = /^[+]?[0-9\s-]{6,20}$/;
export function requirePhone(v: unknown, field: string, errors: Errors, optional = false): string {
  const s = str(v).replace(/[^\d+ -]/g, "");
  if (!s) {
    if (optional) return "";
    errors[field] = "মোবাইল নম্বর আবশ্যক";
    return "";
  }
  if (!PHONE_RE.test(s) || s.replace(/\D/g, "").length < 6) {
    errors[field] = "সঠিক মোবাইল নম্বর দিন";
    return "";
  }
  return s.slice(0, 20);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function requireEmail(v: unknown, field: string, errors: Errors, optional = true): string {
  const s = str(v);
  if (!s) {
    if (optional) return "";
    errors[field] = "ইমেইল আবশ্যক";
    return "";
  }
  if (!EMAIL_RE.test(s)) {
    errors[field] = "সঠিক ইমেইল দিন";
    return "";
  }
  return s.toLowerCase().slice(0, 160);
}

export function requirePassword(v: unknown, field: string, errors: Errors, min = 4): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (!s) {
    errors[field] = "পাসওয়ার্ড আবশ্যক";
    return "";
  }
  if (s.length < min) {
    errors[field] = `পাসওয়ার্ড কমপক্ষে ${min} অক্ষরের হতে হবে`;
    return "";
  }
  if (s.length > 200) {
    errors[field] = "পাসওয়ার্ড অনেক দীর্ঘ";
    return "";
  }
  return s;
}

export function requireMatch(a: unknown, b: unknown, field: string, errors: Errors): void {
  if (String(a ?? "") !== String(b ?? "")) errors[field] = "পাসওয়ার্ড মিলছে না";
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string, errors: Errors, fallback: T): T {
  const s = str(v) as T;
  if (!allowed.includes(s)) {
    errors[field] = `${field} সঠিক নয়`;
    return fallback;
  }
  return s;
}

export function requireId(v: unknown, field: string, errors: Errors): string {
  const s = str(v);
  if (!s) {
    errors[field] = `${field} আবশ্যক`;
    return "";
  }
  if (s.length > 80) {
    errors[field] = `${field} সঠিক নয়`;
    return "";
  }
  return s;
}

export function hasErrors(errors: Errors): boolean {
  return Object.keys(errors).length > 0;
}

export function throwIfInvalid(errors: Errors, message = "ইনপুট সঠিক নয়"): void {
  if (hasErrors(errors)) throw new ValidationError(message, errors, 400);
}

/** `Mess Meal Manager - Gobra` style slug for office ids */
export function slugify(input: string): string {
  return str(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
