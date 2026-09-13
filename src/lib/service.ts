/**
 * High-level application services used by the API routes:
 * office signup, member join, approvals, admin office/user management.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { messMonths, offices, users, cryptoId, type Role, type User, type UserStatus } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { dhakaNow } from "@/lib/date";
import {
  createOffice,
  ensureMonth,
  findOfficeByCode,
  getOffice,
  listMonths,
  syncUserToRosters,
  updateOffice,
} from "@/lib/mess-data";
import { slugify } from "@/lib/validate";

export class ServiceError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(message: string, status = 400, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

/* ────────────────────────────────────────────────────────────
 *  Office signup (spec §12–§13)
 * ──────────────────────────────────────────────────────────── */

export interface OfficeSignupInput {
  officeName: string;
  branch: string;
  userId: string;
  managerName: string;
  email: string;
  phone: string;
  password: string;
  address?: string;
}

export async function signupOffice(input: OfficeSignupInput) {
  const existingUser = await db.select().from(users).where(eq(users.userId, input.userId)).limit(1);
  if (existingUser[0]) {
    throw new ServiceError("এই User ID / মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে", 409, {
      userId: "ইতিমধ্যে ব্যবহৃত",
    });
  }

  const office = await createOffice({
    name: input.officeName,
    branch: input.branch,
    address: input.address ?? "",
    managerName: input.managerName,
    managerEmail: input.email,
    managerPhone: input.phone,
    status: "active",
  });

  const manager = await createUser({
    userId: input.userId,
    name: input.managerName,
    email: input.email,
    phone: input.phone,
    branch: input.branch,
    officeId: office.id,
    role: "manager",
    status: "active",
    password: input.password,
  });

  const now = dhakaNow();
  const month = await ensureMonth(office.id, now.year, now.month);

  return { office, manager, month, officeCode: office.code };
}

/* ────────────────────────────────────────────────────────────
 *  Member join (spec §14–§15)
 * ──────────────────────────────────────────────────────────── */

export interface MemberJoinInput {
  name: string;
  userId: string;
  phone: string;
  email: string;
  password: string;
  officeCode: string;
  room?: string;
}

export async function joinOffice(input: MemberJoinInput) {
  const office = await findOfficeByCode(input.officeCode);
  if (!office) {
    throw new ServiceError("অফিস কোড সঠিক নয় — ম্যানেজারের কাছে থেকে কোডটি নিন", 404, {
      officeCode: "অফিস কোড পাওয়া যায়নি",
    });
  }
  if (office.status === "inactive") {
    throw new ServiceError("এই অফিসটি বর্তমানে নিষ্ক্রিয়", 403);
  }

  const existing = await db.select().from(users).where(eq(users.userId, input.userId)).limit(1);
  if (existing[0]) {
    throw new ServiceError("এই User ID / মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে", 409, {
      userId: "ইতিমধ্যে ব্যবহৃত",
    });
  }

  const user = await createUser({
    userId: input.userId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    branch: office.branch,
    officeId: office.id,
    role: "member",
    status: "pending",
    password: input.password,
  });

  // appear on the roster of the most recent months straight away
  await syncUserToRosters(user);

  return { user, office };
}

/* ────────────────────────────────────────────────────────────
 *  user helpers
 * ──────────────────────────────────────────────────────────── */

export interface CreateUserInput {
  userId: string;
  name: string;
  email: string;
  phone: string;
  branch?: string;
  officeId: string | null;
  role: Role;
  status: UserStatus;
  password: string;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const rows = await db
    .insert(users)
    .values({
      id: cryptoId("user"),
      userId: input.userId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      branch: input.branch ?? "",
      officeId: input.officeId,
      role: input.role,
      status: input.status,
      password: hashPassword(input.password),
    })
    .returning();
  return rows[0]!;
}

export async function setUserStatus(
  userId: string,
  status: UserStatus,
  scopeOfficeId?: string | null,
): Promise<User | null> {
  const conditions = scopeOfficeId
    ? and(eq(users.id, userId), eq(users.officeId, scopeOfficeId))
    : eq(users.id, userId);
  const rows = await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(conditions)
    .returning();
  const user = rows[0] ?? null;
  if (user && status === "approved") await syncUserToRosters(user);
  return user;
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ password: hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return rows.length > 0;
}

export async function changeUserRole(userId: string, role: Role): Promise<User | null> {
  const rows = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  return rows[0] ?? null;
}

/* ────────────────────────────────────────────────────────────
 *  admin office management (spec §83–§84)
 * ──────────────────────────────────────────────────────────── */

export interface AdminOfficeInput {
  id?: string;
  name: string;
  branch?: string;
  code?: string;
  address?: string;
  managerName?: string;
  managerEmail?: string;
  managerPhone?: string;
  status?: "pending" | "approved" | "active" | "inactive";
  sheetUrl?: string;
  scriptUrl?: string;
  note?: string;
}

export async function adminSaveOffice(input: AdminOfficeInput) {
  if (input.id) {
    const current = await getOffice(input.id);
    if (!current) throw new ServiceError("অফিস পাওয়া যায়নি", 404);
    const updated = await updateOffice(input.id, {
      name: input.name,
      branch: input.branch ?? current.branch,
      address: input.address ?? current.address,
      code: input.code ? input.code.toUpperCase() : current.code,
      managerName: input.managerName ?? current.managerName,
      managerEmail: input.managerEmail ?? current.managerEmail,
      managerPhone: input.managerPhone ?? current.managerPhone,
      status: input.status ?? current.status,
      sheetUrl: input.sheetUrl ?? current.sheetUrl,
      scriptUrl: input.scriptUrl ?? current.scriptUrl,
      note: input.note ?? current.note,
    });
    return updated;
  }

  const office = await createOffice({
    name: input.name,
    branch: input.branch ?? "",
    address: input.address ?? "",
    managerName: input.managerName ?? "",
    managerEmail: input.managerEmail ?? "",
    managerPhone: input.managerPhone ?? "",
    status: input.status ?? "active",
    sheetUrl: input.sheetUrl ?? "",
  });
  if (input.scriptUrl || input.note) {
    return updateOffice(office.id, { scriptUrl: input.scriptUrl ?? "", note: input.note ?? "" });
  }
  return office;
}

export async function setOfficeStatus(officeId: string, status: "active" | "inactive" | "pending" | "approved") {
  return updateOffice(officeId, { status });
}

export async function officeMonthOverview(officeId: string) {
  const months = await listMonths(officeId);
  return months.map((m) => ({
    id: m.id,
    monthName: m.monthName,
    year: m.year,
    month: m.month,
    isClosed: m.isClosed,
  }));
}

/** ensure the office has an open month for "now" (called on login / bootstrap) */
export async function ensureCurrentMonth(officeId: string) {
  const now = dhakaNow();
  return ensureMonth(officeId, now.year, now.month);
}

export async function countOfficeMembers(officeId: string) {
  const months = await db.select({ id: messMonths.id }).from(messMonths).where(eq(messMonths.officeId, officeId));
  return months.length;
}

export function officeSlug(name: string) {
  return slugify(name);
}
