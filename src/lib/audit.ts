import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { clientIp, type SessionContext } from "@/lib/auth";

export interface AuditInput {
  ctx: {
    user: SessionContext["user"];
    activeOfficeId?: string | null;
  };
  action: string;
  entity?: string;
  entityId?: string;
  monthId?: string;
  ok?: boolean;
  message?: string;
  meta?: unknown;
}

/**
 * Audit trail (spec §97) — best effort, never breaks the main operation.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const ip = await clientIp().catch(() => "");
    await db.insert(auditLogs).values({
      userId: input.ctx.user.id,
      userName: input.ctx.user.name,
      role: input.ctx.user.role,
      officeId: input.ctx.activeOfficeId ?? input.ctx.user.officeId ?? "",
      monthId: input.monthId ?? "",
      action: input.action,
      entity: input.entity ?? "",
      entityId: input.entityId ?? "",
      ok: input.ok ?? true,
      message: input.message ?? "",
      meta: (input.meta ?? null) as never,
      ip,
    });
  } catch (err) {
    console.error("[audit] failed:", (err as Error).message);
  }
}

export async function listAuditLogs(officeId: string, limit = 200) {
  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.officeId, officeId)))
    .orderBy(desc(auditLogs.at))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    userName: r.userName,
    role: r.role,
    officeId: r.officeId,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    ok: r.ok,
    message: r.message,
  }));
}

export async function listAllAuditLogs(limit = 200) {
  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.at)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    userName: r.userName,
    role: r.role,
    officeId: r.officeId,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    ok: r.ok,
    message: r.message,
  }));
}
