import { and, eq, sql } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { Db, DbExecutor } from "./client";
import { InvitationStateError, NotFoundError } from "./errors";
import { invitations, vaultKeyEnvelopes, vaultMemberships, vaults } from "./schema";

/**
 * Invitation lifecycle (sharing-protocol §2, ADR-005):
 *   pending → accepted → active   (Flow B: envelope attached at activation)
 *   pending(+envelope) → active   (Flow A: envelope wrapped at creation)
 *   pending|accepted → revoked | expired
 * The envelope column is only ever an enc.box to the invitee's public key —
 * there is no state in which the server holds recoverable key material.
 */

const DEFAULT_TTL_DAYS = 7;

export async function createInvitation(
  db: Db,
  input: {
    vaultId: string;
    inviteeEmail: string;
    role: "owner" | "member";
    invitedByUserId: string;
    /** Flow A: wrapped envelope available immediately. Flow B: omitted. */
    envelope?: unknown;
    ttlDays?: number;
    /** Temporary access: membership expiry applied at activation (machine-identities §2). */
    membershipExpiresAt?: Date | null;
  }
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const expiresAt = new Date(Date.now() + (input.ttlDays ?? DEFAULT_TTL_DAYS) * 86_400_000);
    const [inv] = await tx
      .insert(invitations)
      .values({
        vaultId: input.vaultId,
        inviteeEmail: input.inviteeEmail,
        role: input.role,
        invitedByUserId: input.invitedByUserId,
        envelope: input.envelope ?? null,
        expiresAt,
        membershipExpiresAt: input.membershipExpiresAt ?? null,
      })
      .returning({ id: invitations.id });
    await appendAudit(tx, {
      vaultId: input.vaultId,
      actorUserId: input.invitedByUserId,
      type: "member_invited",
      context: { invitationId: inv.id },
    });
    return inv;
  });
}

export async function getInvitation(executor: DbExecutor, invitationId: string) {
  const rows = await executor
    .select()
    .from(invitations)
    .where(eq(invitations.id, invitationId))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("invitation not found");
  return rows[0];
}

/** Pending invitations addressed to an email (invitee's inbox view). */
export async function listInvitationsForEmail(executor: DbExecutor, email: string) {
  return executor
    .select()
    .from(invitations)
    .where(
      and(sql`lower(${invitations.inviteeEmail}) = lower(${email})`, eq(invitations.state, "pending"))
    );
}

/** All invitations for a vault (owner management view). */
export async function listInvitationsForVault(executor: DbExecutor, vaultId: string) {
  return executor.select().from(invitations).where(eq(invitations.vaultId, vaultId));
}

/** Invitations awaiting the owner's wrap (Flow B, state=accepted, no envelope). */
export async function listAwaitingWrap(executor: DbExecutor, vaultId: string) {
  return executor
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.vaultId, vaultId),
        eq(invitations.state, "accepted"),
        sql`${invitations.envelope} is null`
      )
    );
}

/** Invitee accepts. Flow A (envelope present) activates immediately;
 *  Flow B moves to 'accepted' awaiting the owner's wrap. */
export async function acceptInvitation(
  db: Db,
  invitationId: string,
  inviteeUserId: string
): Promise<{ state: "active" | "accepted" }> {
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .for("update");
    if (!inv) throw new NotFoundError("invitation not found");
    if (inv.state !== "pending") throw new InvitationStateError("invitation is not pending");
    if (inv.expiresAt.getTime() < Date.now()) {
      await tx.update(invitations).set({ state: "expired" }).where(eq(invitations.id, inv.id));
      throw new InvitationStateError("invitation expired");
    }
    await appendAudit(tx, {
      vaultId: inv.vaultId,
      actorUserId: inviteeUserId,
      type: "invitation_accepted",
      context: { invitationId: inv.id },
    });
    if (inv.envelope !== null) {
      await activateWithin(tx, inv.id, inv.vaultId, inviteeUserId, inv.role, inv.envelope, inv.membershipExpiresAt);
      return { state: "active" as const };
    }
    await tx.update(invitations).set({ state: "accepted" }).where(eq(invitations.id, inv.id));
    return { state: "accepted" as const };
  });
}

/** Owner's deferred wrap (Flow B step 3): attach envelope + activate membership. */
export async function attachEnvelopeAndActivate(
  db: Db,
  invitationId: string,
  input: { inviteeUserId: string; envelope: unknown; actorUserId: string }
): Promise<void> {
  await db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .for("update");
    if (!inv) throw new NotFoundError("invitation not found");
    if (inv.state !== "accepted" || inv.envelope !== null) {
      throw new InvitationStateError("invitation is not awaiting wrap");
    }
    await tx
      .update(invitations)
      .set({ envelope: input.envelope })
      .where(eq(invitations.id, inv.id));
    await activateWithin(tx, inv.id, inv.vaultId, input.inviteeUserId, inv.role, input.envelope, inv.membershipExpiresAt);
    await appendAudit(tx, {
      vaultId: inv.vaultId,
      actorUserId: input.actorUserId,
      type: "member_activated",
      context: { invitationId: inv.id, memberUserId: input.inviteeUserId },
    });
  });
}

export async function revokeInvitation(
  db: Db,
  invitationId: string,
  actorUserId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .for("update");
    if (!inv) throw new NotFoundError("invitation not found");
    if (inv.state !== "pending" && inv.state !== "accepted") {
      throw new InvitationStateError("only pending/accepted invitations can be revoked");
    }
    await tx.update(invitations).set({ state: "revoked" }).where(eq(invitations.id, inv.id));
    await appendAudit(tx, {
      vaultId: inv.vaultId,
      actorUserId,
      type: "invitation_revoked",
      context: { invitationId: inv.id },
    });
  });
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function activateWithin(
  tx: Tx,
  invitationId: string,
  vaultId: string,
  userId: string,
  role: string,
  envelope: unknown,
  membershipExpiresAt: Date | null = null
): Promise<void> {
  // The wrap targets the current generation; read it inside the transaction.
  const [vault] = await tx
    .select({ keyGeneration: vaults.keyGeneration })
    .from(vaults)
    .where(eq(vaults.id, vaultId))
    .for("update");
  if (!vault) throw new NotFoundError("vault not found");
  await tx
    .insert(vaultMemberships)
    .values({ vaultId, userId, role, status: "active", expiresAt: membershipExpiresAt });
  await tx.insert(vaultKeyEnvelopes).values({
    vaultId,
    userId,
    generation: vault.keyGeneration,
    envelope,
  });
  await tx.update(invitations).set({ state: "active" }).where(eq(invitations.id, invitationId));
}
