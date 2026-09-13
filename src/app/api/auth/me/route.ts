import { api, fail } from "@/lib/api";
import { getSession, publicUser } from "@/lib/auth";
import { listMonths, officeDTO } from "@/lib/mess-data";
import { ensureCurrentMonth } from "@/lib/service";
import { ROLE_HOME, menuForRole } from "@/lib/permissions";
import { db } from "@/db";
import { offices } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/auth/me
 * Returns the current identity, the office in effect, its months and menu.
 */
export const GET = api({ auth: false, limit: "write" }, async () => {
  const ctx = await getSession();
  if (!ctx) return fail("লগইন করা নেই", 401, "login-required");

  const { user, activeOfficeId, office } = ctx;

  let months: Awaited<ReturnType<typeof listMonths>> = [];
  let officePayload = null as ReturnType<typeof officeDTO> | null;
  let home = ROLE_HOME[user.role] ?? "report";

  if (activeOfficeId) {
    await ensureCurrentMonth(activeOfficeId).catch(() => null);
    months = await listMonths(activeOfficeId);
    if (office) officePayload = officeDTO(office);
  }

  let officesList: ReturnType<typeof officeDTO>[] = [];
  if (user.role === "admin") {
    const all = await db.select().from(offices);
    officesList = all.map(officeDTO);
  }

  return {
    authenticated: true,
    user: {
      ...publicUser(user, office?.name ?? null),
      activeOfficeId,
      canSwitchOffice: user.role === "admin",
    },
    office: officePayload,
    offices: officesList,
    months: months.map((m) => ({
      id: m.id,
      year: m.year,
      month: m.month,
      monthName: m.monthName,
      totalDays: m.totalDays,
      isClosed: m.isClosed,
    })),
    menu: menuForRole(user.role).map((m) => ({ tab: m.tab, bn: m.bn, en: m.en, icon: m.icon })),
    home,
    requiresApproval: user.status === "pending",
  };
});
