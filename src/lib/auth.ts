import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { offices, sessions, users, type Role, type User } from "@/db/schema";
import { audit } from "@/lib/audit";
import { randomToken } from "@/lib/random";

export const SESSION_COOKIE = "mmm_session";
export const SESSION_TTL_DAYS = 7;

export interface SessionContext {
  user: User;
  session: typeof sessions.$inferSelect;
  office: typeof offices.$inferSelect | null;
  /** office actually in effect — honours the admin office switcher */
  activeOfficeId: string | null;
}

/* ── cookie helpers ───────────────────────────────────────── */

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function writeSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "local";
}

export async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get("user-agent") ?? "").slice(0, 300);
}

/* ── session lifecycle ────────────────────────────────────── */

export async function createSession(user: User): Promise<string> {
  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({
    id: token,
    userId: user.id,
    role: user.role,
    officeId: user.officeId,
    currentOfficeId: user.role === "admin" ? user.officeId : user.officeId,
    ip: await clientIp(),
    userAgent: await userAgent(),
    expiresAt,
  });
  await writeSessionCookie(token);
  return token;
}

export async function destroySession(): Promise<void> {
  const token = await readSessionToken();
  if (token) await db.delete(sessions).where(eq(sessions.id, token));
  await clearSessionCookie();
}

/** Session → User → Role → Office validation chain (spec §78). */
export async function getSession(): Promise<SessionContext | null> {
  const token = await readSessionToken();
  if (!token) return null;

  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) {
    await clearSessionCookie();
    return null;
  }

  const { session, user } = row;
  if (user.status === "inactive" || user.status === "rejected") {
    await db.delete(sessions).where(eq(sessions.id, token));
    await clearSessionCookie();
    return null;
  }

  let office = null as typeof offices.$inferSelect | null;
  const wantedOfficeId = user.role === "admin" ? session.currentOfficeId ?? null : user.officeId;
  if (wantedOfficeId) {
    const found = await db.select().from(offices).where(eq(offices.id, wantedOfficeId)).limit(1);
    office = found[0] ?? null;
  }

  // Non-admins can never escape their own office.
  const activeOfficeId = user.role === "admin" ? office?.id ?? null : user.officeId ?? null;

  if (office && office.status === "inactive" && user.role !== "admin") {
    return null; // office deactivated → access blocked (spec §84)
  }

  return { user, session, office, activeOfficeId };
}

export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSession();
  if (!ctx) throw new AuthError("login-required", "অনুগ্রহ করে লগইন করুন");
  return ctx;
}

export async function requireOffice(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!ctx.activeOfficeId || !ctx.office) {
    throw new AuthError("office-required", "কোনো অফিস নির্বাচন করা হয়নি");
  }
  if (ctx.office.status === "inactive" && ctx.user.role !== "admin") {
    throw new AuthError("office-inactive", "এই অফিসটি নিষ্ক্রিয়");
  }
  return ctx;
}

export class AuthError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 401) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/* ── admin office switcher (spec §80) ─────────────────────── */

export async function setActiveOffice(officeId: string | null): Promise<void> {
  const ctx = await requireSession();
  if (ctx.user.role !== "admin") throw new AuthError("forbidden", "শুধু অ্যাডমিন অফিস পরিবর্তন করতে পারবেন", 403);

  if (officeId) {
    const found = await db.select().from(offices).where(eq(offices.id, officeId)).limit(1);
    if (!found[0]) throw new AuthError("not-found", "অফিস পাওয়া যায়নি", 404);
  }

  await db.update(sessions).set({ currentOfficeId: officeId }).where(eq(sessions.id, ctx.session.id));
  await audit({
    ctx,
    action: "office.switch",
    entity: "office",
    entityId: officeId ?? "",
    message: officeId ? `অফিস পরিবর্তন → ${officeId}` : "অফিস নির্বাচন বাতিল",
  });
}

/* ── convenience ──────────────────────────────────────────── */

export async function listActiveOffices() {
  return db.select().from(offices).where(or(isNull(offices.status), gt(offices.name, "")));
}

export function publicUser(u: User, officeName?: string | null) {
  return {
    id: u.id,
    userId: u.userId,
    name: u.name,
    email: u.email,
    phone: u.phone,
    branch: u.branch,
    officeId: u.officeId,
    officeName: officeName ?? null,
    role: u.role as Role,
    status: u.status,
    lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}
