import { getDb, getMembership } from "../db";
import { forbidden, notFound } from "./errors";

/**
 * Central vault authorization (plannings/04 D2, threat-model T4).
 * Every vault-scoped endpoint calls one of these before touching data.
 * Non-members get 404 (not 403) so vault existence is not leaked.
 */

export interface Membership {
  role: "owner" | "member";
  userId: string;
  vaultId: string;
}

export async function requireVaultMember(vaultId: string, userId: string): Promise<Membership> {
  const membership = await getMembership(getDb(), vaultId, userId);
  if (!membership || membership.status !== "active") throw notFound();
  return { role: membership.role as "owner" | "member", userId, vaultId };
}

/** Owner-only operations (handoff §6): manage vault/environments/members/files. */
export async function requireVaultOwner(vaultId: string, userId: string): Promise<Membership> {
  const membership = await requireVaultMember(vaultId, userId);
  if (membership.role !== "owner") throw forbidden();
  return membership;
}
