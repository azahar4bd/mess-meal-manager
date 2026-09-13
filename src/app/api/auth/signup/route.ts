import { api, fail } from "@/lib/api";
import { createSession, publicUser } from "@/lib/auth";
import { signupOffice, ServiceError } from "@/lib/service";
import { officeDTO } from "@/lib/mess-data";
import { ROLE_HOME } from "@/lib/permissions";
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
 * POST /api/auth/signup  — create a brand new Office + its Manager (spec §12).
 */
export const POST = api({ auth: false, limit: "signup", auditAction: "auth.signup" }, async (_req, _ctx, body) => {
  const errors: Errors = {};

  const officeName = requireString(body.officeName, "officeName", errors, { min: 2, max: 80 });
  const branch = str(body.branch).slice(0, 60);
  const userId = requireString(body.userId, "userId", errors, { min: 4, max: 30 });
  const managerName = requireString(body.managerName, "managerName", errors, { min: 2, max: 80 });
  const email = requireEmail(body.email, "email", errors, true);
  const phone = requirePhone(body.phone, "phone", errors, true);
  const password = requirePassword(body.password, "password", errors, 4);
  requireMatch(body.password, body.confirmPassword, "confirmPassword", errors);
  const address = str(body.address).slice(0, 200);

  if (hasErrors(errors)) return fail("ফর্মে কিছু তথ্য সঠিক নয়", 400, "validation", errors);
  if (!phone && !email) {
    return fail("মোবাইল নম্বর অথবা ইমেইল — কমপক্ষে একটি দিতে হবে", 400, "validation", {
      phone: "আবশ্যক",
    });
  }

  try {
    const { office, manager, month, officeCode } = await signupOffice({
      officeName,
      branch,
      userId,
      managerName,
      email,
      phone,
      password,
      address,
    });

    await createSession(manager);
    await audit({
      ctx: { user: manager, activeOfficeId: office.id },
      action: "office.create",
      entity: "office",
      entityId: office.id,
      message: `নতুন অফিস তৈরি: ${office.name} (${officeCode})`,
    });

    return {
      user: publicUser(manager, office.name),
      office: officeDTO(office),
      officeCode,
      month: { id: month.id, monthName: month.monthName, year: month.year, month: month.month },
      home: ROLE_HOME.manager,
      message: `অফিস "${office.name}" তৈরি হয়েছে। অফিস কোড: ${officeCode} — এই কোড দিয়ে সদস্যরা Join করতে পারবেন।`,
    };
  } catch (err) {
    if (err instanceof ServiceError) return fail(err.message, err.status, "service", err.fields);
    throw err;
  }
});
