/**
 * Audit logging utility
 *
 * Appends an immutable row to audit_logs for every sensitive admin action.
 * All calls are fire-and-forget — a logging failure never blocks the main operation.
 *
 * Usage:
 *   await auditLog(session, "exam.delete", "exam", exam.id, exam.title)
 */

import { db } from "@/lib/db"

export interface AuditActor {
  user: {
    id?:   string | null
    name?: string | null
    role?: string | null
  }
}

export async function auditLog(
  actor:      AuditActor,
  action:     string,
  entityType: string,
  entityId?:  string | null,
  entityName?: string | null,
  metadata:   Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.from("audit_logs").insert({
      actor_id:    actor.user.id   ?? null,
      actor_name:  actor.user.name ?? "Unknown",
      actor_role:  actor.user.role ?? "unknown",
      action,
      entity_type: entityType,
      entity_id:   entityId   ?? null,
      entity_name: entityName ?? null,
      metadata,
    })
  } catch (e) {
    // Never let audit logging break the main flow
    console.error("[audit] Failed to write audit log:", e)
  }
}
