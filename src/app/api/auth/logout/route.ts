import { api } from "@/lib/api";
import { destroySession, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/auth/logout */
export const POST = api({ auth: false, limit: "write", auditAction: "auth.logout" }, async () => {
  const ctx = await getSession().catch(() => null);
  await destroySession();
  if (ctx) {
    await audit({ ctx, action: "auth.logout", entity: "user", entityId: ctx.user.id, message: "লগআউট" });
  }
  return { loggedOut: true };
});
