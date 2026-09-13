import { api, fail } from "@/lib/api";
import { createSession, publicUser } from "@/lib/auth";
import { joinOffice, ServiceError } from "@/lib/service";
import {
  hasErrors,
  requireEmail,
  requireMatch,
  requirePassword,
  requirePhone,
  requireString,
  str,
  type Errors,
} from "@/lib/validate";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/join — a member joins an existing office using its Office Code (spec §14).
 * The account is created with status = pending until a manager/admin approves it.
 */
export const POST = api({ auth: false, limit: "join", auditAction: "auth.join" }, async (_req, _ctx, body) => {
  const errors: Errors = {};

  const name = requireString(body.name, "name", errors, { min: 2, max: 80 });
  const phone = requirePhone(body.phone ?? body.userId, "phone", errors, false);
  const userId = requireString(body.userId ?? body.phone, "userId", errors, { min: 4, max: 30 });
  const email = requireEmail(body.email, "email", errors, true);
  const password = requirePassword(body.password, "password", errors, 4);
  requireMatch(body.password, body.confirmPassword, "confirmPassword", errors);
  const officeCode = requireString(body.officeCode, "officeCode", errors, { min: 3, max: 30 }).toUpperCase();
  const room = str(body.room).slice(0, 40);

  if (hasErrors(errors)) return fail("ফর্মে কিছু তথ্য সঠিক নয়", 400, "validation", errors);

  try {
    const { user, office } = await joinOffice({
      name,
      userId,
      phone,
      email,
      password,
      officeCode,
      room,
    });

    await createSession(user);
    await audit({
      ctx: { user, activeOfficeId: office.id },
      action: "member.join",
      entity: "office",
      entityId: office.id,
      message: `${name} অফিস ${office.name}-এ যোগদানের অনুরোধ করেছেন`,
    });

    return {
      user: publicUser(user, office.name),
      office: { id: office.id, name: office.name, branch: office.branch, code: office.code },
      status: user.status,
      pendingApproval: user.status === "pending",
      message:
        user.status === "pending"
          ? `অনুরোধ পাঠানো হয়েছে। "${office.name}" অফিসের ম্যানেজার অনুমোদন করলে আপনি পূর্ণ হিসাব দেখতে পাবেন।`
          : "যোগদান সম্পন্ন হয়েছে।",
    };
  } catch (err) {
    if (err instanceof ServiceError) return fail(err.message, err.status, "service", err.fields);
    throw err;
  }
});
