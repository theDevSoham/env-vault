import { desc, eq } from "drizzle-orm";
import type { DbExecutor } from "./client";
import { auditEvents } from "./schema";

/**
 * Audit events (handoff §27). Append-only: this module exposes no update or
 * delete, and migration 0001 installs a trigger rejecting both at the DB level.
 *
 * RULE: `context` must contain only non-secret metadata (ids, counts, formats,
 * generations). Never values, names, envelopes, keys, tokens, or free text
 * copied from request payloads.
 */

export type AuditType =
  | "vault_created"
  | "vault_deleted"
  | "member_invited"
  | "invitation_accepted"
  | "invitation_revoked"
  | "member_activated"
  | "member_removed"
  | "environment_created"
  | "environment_deleted"
  | "revision_created"
  | "revision_restored"
  | "export_requested"
  | "secret_file_uploaded"
  | "secret_file_replaced"
  | "secret_file_deleted"
  | "vault_key_rotated"
  | "device_approved"
  | "device_revoked"
  | "membership_expiry_set"
  | "service_account_created"
  | "service_account_revoked";

export async function appendAudit(
  executor: DbExecutor,
  event: {
    vaultId: string | null;
    actorUserId: string | null;
    type: AuditType;
    context?: Record<string, string | number | boolean | null>;
  }
): Promise<void> {
  await executor.insert(auditEvents).values({
    vaultId: event.vaultId,
    actorUserId: event.actorUserId,
    type: event.type,
    context: event.context ?? {},
  });
}

export async function listAuditEvents(executor: DbExecutor, vaultId: string, limit = 100) {
  return executor
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.vaultId, vaultId))
    .orderBy(desc(auditEvents.id))
    .limit(limit);
}
