import { eq } from "drizzle-orm";
import { db } from "@/db";
import { offices, sessions, users } from "@/db/schema";
import { api, fail } from "@/lib/api";
import { createSession, clientIp, publicUser } from "@/lib/auth";
import { findUserByLogin } from "@/lib/mess-data";
import { verifyPassword } from "@/lib/password";
import { ROLE_HOME } from "@/lib/permissions";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { hasErrors, requirePassword, str, type Errors } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/login
 * body: { login: "User ID / mobile / email", password: "..." }
 */
export const POST = api({ auth: false, limit: "none", auditAction: "auth.login" }, async (req, _ctx, body) => {
  const errors: Errors = {};
  const login = str(body.login ?? body.userId ?? body.phone ?? body.email);
  const password = requirePassword(body.password, "password", errors, 1);

  if (!login) errors.login = "User ID / মোবাইল নম্বর আবশ্যক";
  if (hasErrors(errors)) return fail("লগইন তথ্য অসম্পূর্ণ", 400, "validation", errors);

  const ip = await clientIp();
  const rl = rateLimit(`login-id:${ip}:${login}`, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!rl.ok) {
    return fail(
      `অনেকবার ভুল পাসওয়ার্ড দেওয়া হয়েছে। ${rl.retryAfterSeconds} সেকেন্ড পরে আবার চেষ্টা করুন।`,
      429,
      "rate-limited",
    );
  }

  const user = await findUserByLogin(login);
  if (!user || !verifyPassword(password, user.password)) {
    return fail("User ID বা পাসওয়ার্ড সঠিক নয়", 401, "invalid-credentials");
  }

  const pendingApproval = user.status === "pending";
  if (user.status === "rejected") {
    return fail("আপনার অ্যাকাউন্টটি বাতিল করা হয়েছে", 403, "rejected");
  }
  if (user.status === "inactive") {
    return fail("আপনার অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে", 403, "inactive");
  }

  let office: typeof offices.$inferSelect | null = null;
  if (user.officeId) {
    const found = await db.select().from(offices).where(eq(offices.id, user.officeId)).limit(1);
    office = found[0] ?? null;
    if (office && office.status === "inactive" && user.role !== "admin") {
      return fail("এই অফিসটি বর্তমানে নিষ্ক্রিয় — অ্যাডমিনের সঙ্গে যোগাযোগ করুন", 403, "office-inactive");
    }
  }

  const token = await createSession(user);
  await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));

  // a platform admin has no own office: default the switcher to the first office
  let activeOfficeId = user.officeId;
  if (user.role === "admin" && !activeOfficeId) {
    const anyOffice = await db.select().from(offices).limit(1);
    if (anyOffice[0]) {
      activeOfficeId = anyOffice[0].id;
      await db.update(sessions).set({ currentOfficeId: anyOffice[0].id }).where(eq(sessions.id, token));
      office = anyOffice[0];
    }
  }

  const ctxUser = { ...user, officeId: user.officeId };
  await audit({
    ctx: { user: ctxUser, activeOfficeId },
    action: "auth.login",
    entity: "user",
    entityId: user.id,
    message: `${user.name} (${user.role}) লগইন করলেন`,
  });

  return {
    user: publicUser(user, office?.name ?? null),
    office: office
      ? { id: office.id, name: office.name, branch: office.branch, code: office.code }
      : null,
    activeOfficeId,
    home: ROLE_HOME[user.role] ?? "report",
    requiresApproval: pendingApproval,
    status: user.status,
    message: pendingApproval
      ? `লগইন সফল হয়েছে, তবে আপনার অ্যাকাউন্টটি এখনো ম্যানেজারের অনুমোদনের অপেক্ষায় আছে। অনুমোদনের পর আপনি পূর্ণ হিসাব দেখতে পাবেন।`
      : undefined,
  };
});
