import { and, eq } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { Db, DbExecutor } from "./client";
import { NotFoundError } from "./errors";
import { environments, userKeys, users, vaultKeyEnvelopes, vaultMemberships, vaults } from "./schema";

/**
 * Vaults, memberships, and wrapped vault-key envelopes (handoff §16–17).
 * The server only ever stores enc.box envelopes — never plaintext vault keys.
 */

export interface CreateVaultInput {
  /** Client-generated UUID — must exist before creation because the encrypted
   *  name's AAD binds to it (crypto-spec §7). */
  id: string;
  ownerUserId: string;
  nameEnv: unknown; // enc.rec (encrypted vault name, ADR-004)
  ownerEnvelope: unknown; // enc.box (vault key wrapped for owner)
}

export async function createVault(db: Db, input: CreateVaultInput): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [vault] = await tx
      .insert(vaults)
      .values({ id: input.id, nameEnv: input.nameEnv })
      .returning({ id: vaults.id });
    await tx.insert(vaultMemberships).values({
      vaultId: vault.id,
      userId: input.ownerUserId,
      role: "owner",
      status: "active",
    });
    await tx.insert(vaultKeyEnvelopes).values({
      vaultId: vault.id,
      userId: input.ownerUserId,
      generation: 1,
      envelope: input.ownerEnvelope,
    });
    await appendAudit(tx, {
      vaultId: vault.id,
      actorUserId: input.ownerUserId,
      type: "vault_created",
    });
    return vault;
  });
}

export async function getVault(executor: DbExecutor, vaultId: string) {
  const rows = await executor.select().from(vaults).where(eq(vaults.id, vaultId)).limit(1);
  if (!rows[0]) throw new NotFoundError("vault not found");
  return rows[0];
}

/** Active membership for a user in a vault — the central authorization lookup. */
export async function getMembership(executor: DbExecutor, vaultId: string, userId: string) {
  const rows = await executor
    .select()
    .from(vaultMemberships)
    .where(
      and(
        eq(vaultMemberships.vaultId, vaultId),
        eq(vaultMemberships.userId, userId),
        eq(vaultMemberships.status, "active")
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listVaultsForUser(executor: DbExecutor, userId: string) {
  return executor
    .select({
      vaultId: vaults.id,
      nameEnv: vaults.nameEnv,
      keyGeneration: vaults.keyGeneration,
      role: vaultMemberships.role,
    })
    .from(vaultMemberships)
    .innerJoin(vaults, eq(vaultMemberships.vaultId, vaults.id))
    .where(and(eq(vaultMemberships.userId, userId), eq(vaultMemberships.status, "active")));
}

/** Active members with email + public key (client needs keys for re-wrapping
 *  during rotation, and fingerprints for display — threat-model T9). */
export async function listActiveMembers(executor: DbExecutor, vaultId: string) {
  return executor
    .select({
      userId: vaultMemberships.userId,
      role: vaultMemberships.role,
      createdAt: vaultMemberships.createdAt,
      email: users.email,
      publicKey: userKeys.publicKey,
    })
    .from(vaultMemberships)
    .innerJoin(users, eq(vaultMemberships.userId, users.id))
    .innerJoin(userKeys, eq(vaultMemberships.userId, userKeys.userId))
    .where(and(eq(vaultMemberships.vaultId, vaultId), eq(vaultMemberships.status, "active")));
}

/** All envelopes a member holds for a vault (one per generation they're entitled to). */
export async function listKeyEnvelopesForMember(
  executor: DbExecutor,
  vaultId: string,
  userId: string
) {
  return executor
    .select()
    .from(vaultKeyEnvelopes)
    .where(and(eq(vaultKeyEnvelopes.vaultId, vaultId), eq(vaultKeyEnvelopes.userId, userId)))
    .orderBy(vaultKeyEnvelopes.generation);
}

export async function addKeyEnvelope(
  executor: DbExecutor,
  input: { vaultId: string; userId: string; generation: number; envelope: unknown }
): Promise<void> {
  await executor.insert(vaultKeyEnvelopes).values(input);
}

export async function listEnvironments(executor: DbExecutor, vaultId: string) {
  return executor.select().from(environments).where(eq(environments.vaultId, vaultId));
}

/**
 * Vault deletion cascades all contents (memberships, envelopes, environments,
 * revisions, files, invitations). Audit events survive untouched — the audit
 * table has no FKs by design (immutable log outlives its referents).
 */
export async function deleteVault(db: Db, vaultId: string, actorUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await tx.delete(vaults).where(eq(vaults.id, vaultId)).returning({
      id: vaults.id,
    });
    if (deleted.length === 0) throw new NotFoundError("vault not found");
    await appendAudit(tx, { vaultId, actorUserId, type: "vault_deleted" });
  });
}
