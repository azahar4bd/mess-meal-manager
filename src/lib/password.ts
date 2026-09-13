import crypto from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Passwords are NEVER stored in plain text (spec §77).
 * bcrypt cost 10 — safe default for a small multi-tenant app.
 */
const COST = Number(process.env.BCRYPT_COST ?? 10);

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, COST);
}

export function verifyPassword(plain: string, hash: string): boolean {
  if (!plain || !hash) return false;
  // tolerate legacy demo seeds that were stored as plain text
  if (!hash.startsWith("$2")) return hash === plain;
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

export function isHashed(value: string): boolean {
  return typeof value === "string" && value.startsWith("$2");
}

/**
 * Constant-time string comparison — used for shared secrets (MIGRATION_SECRET,
 * Apps Script API token) so a wrong guess cannot be timed.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}
