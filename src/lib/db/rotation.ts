import { and, eq } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { Db } from "./client";
import { NotFoundError, RevisionConflictError, RotationConflictError } from "./errors";
import {
  environments,
  fileChunks,
  revisions,
  secretFiles,
  vaultKeyEnvelopes,
  vaultMemberships,
  vaults,
} from "./schema";

/**
 * Atomic vault-key rotation commit (revocation-protocol §3 steps 6–8,
 * handoff §34.11). The owner's client did all cryptography; this transaction
 * validates and applies everything or nothing:
 *  - base generation must still be current (serializes concurrent rotations)
 *  - every remaining active member gets exactly one new envelope, removed member none
 *  - one re-encrypted head revision per environment, each conflict-checked
 *  - re-encrypted names and file rewrites swapped in
 *  - membership deactivated only on success — removal is invisible until rotation lands
 */

export interface RotationCommitInput {
  vaultId: string;
  actorUserId: string;
  baseGeneration: number;
  removedUserId: string;
  newVaultNameEnv: unknown;
  newEnvelopes: { userId: string; envelope: unknown }[];
  newRevisions: {
    environmentId: string;
    baseRevision: number;
    snapshotEnv: unknown;
    diffEnv: unknown;
    nameEnv: unknown; // environment name re-encrypted under the new key
  }[];
  fileRewrites: {
    fileId: string;
    streamEnv: unknown;
    sizeBytes: number;
    chunks: Uint8Array[];
  }[];
}

export async function commitKeyRotation(db: Db, input: RotationCommitInput): Promise<void> {
  await db.transaction(async (tx) => {
    // Lock the vault row and check the base generation (concurrent-rotation serialization)
    const [vault] = await tx
      .select({ generation: vaults.keyGeneration })
      .from(vaults)
      .where(eq(vaults.id, input.vaultId))
      .for("update");
    if (!vault) throw new NotFoundError("vault not found");
    if (vault.generation !== input.baseGeneration) {
      throw new RotationConflictError("stale base generation");
    }
    const newGeneration = input.baseGeneration + 1;

    // Envelope-set validation: exactly the remaining active members, no extras
    const members = await tx
      .select({ userId: vaultMemberships.userId })
      .from(vaultMemberships)
      .where(
        and(eq(vaultMemberships.vaultId, input.vaultId), eq(vaultMemberships.status, "active"))
      );
    const remaining = new Set(
      members.map((m) => m.userId).filter((id) => id !== input.removedUserId)
    );
    const provided = new Set(input.newEnvelopes.map((e) => e.userId));
    if (provided.has(input.removedUserId)) {
      throw new RotationConflictError("envelope provided for removed member");
    }
    if (remaining.size !== provided.size || [...remaining].some((id) => !provided.has(id))) {
      throw new RotationConflictError("envelope set does not match remaining members");
    }
    // Every environment of the vault must be re-encrypted — none skipped
    const vaultEnvs = await tx
      .select({ id: environments.id })
      .from(environments)
      .where(eq(environments.vaultId, input.vaultId));
    const coveredEnvs = new Set(input.newRevisions.map((r) => r.environmentId));
    if (
      vaultEnvs.length !== input.newRevisions.length ||
      vaultEnvs.some((e) => !coveredEnvs.has(e.id))
    ) {
      throw new RotationConflictError("rotation must cover every environment exactly once");
    }

    // Deactivate the removed membership
    const removed = await tx
      .update(vaultMemberships)
      .set({ status: "removed" })
      .where(
        and(
          eq(vaultMemberships.vaultId, input.vaultId),
          eq(vaultMemberships.userId, input.removedUserId),
          eq(vaultMemberships.status, "active")
        )
      )
      .returning({ id: vaultMemberships.id });
    if (removed.length === 0) {
      throw new RotationConflictError("removed member is not an active member");
    }

    // New envelopes at the new generation (removed member gets none — handoff §20.5)
    await tx.insert(vaultKeyEnvelopes).values(
      input.newEnvelopes.map((e) => ({
        vaultId: input.vaultId,
        userId: e.userId,
        generation: newGeneration,
        envelope: e.envelope,
      }))
    );

    // One re-encrypted head revision per environment, each conflict-checked
    for (const rev of input.newRevisions) {
      const [env] = await tx
        .select({ head: environments.headRevision })
        .from(environments)
        .where(eq(environments.id, rev.environmentId))
        .for("update");
      if (!env) throw new NotFoundError("environment not found");
      if (env.head !== rev.baseRevision) throw new RevisionConflictError(env.head);
      const number = rev.baseRevision + 1;
      await tx.insert(revisions).values({
        vaultId: input.vaultId,
        environmentId: rev.environmentId,
        number,
        actorUserId: input.actorUserId,
        keyGeneration: newGeneration,
        message: "Vault key rotated",
        snapshotEnv: rev.snapshotEnv,
        diffEnv: rev.diffEnv,
      });
      await tx
        .update(environments)
        .set({ headRevision: number, nameEnv: rev.nameEnv })
        .where(eq(environments.id, rev.environmentId));
    }

    // Re-encrypted file streams + chunks
    for (const rewrite of input.fileRewrites) {
      const updated = await tx
        .update(secretFiles)
        .set({
          streamEnv: rewrite.streamEnv,
          sizeBytes: rewrite.sizeBytes,
          keyGeneration: newGeneration,
          updatedAt: new Date(),
        })
        .where(
          and(eq(secretFiles.id, rewrite.fileId), eq(secretFiles.vaultId, input.vaultId))
        )
        .returning({ id: secretFiles.id });
      if (updated.length === 0) throw new NotFoundError("secret file not found in vault");
      await tx.delete(fileChunks).where(eq(fileChunks.fileId, rewrite.fileId));
      if (rewrite.chunks.length > 0) {
        await tx.insert(fileChunks).values(
          rewrite.chunks.map((data, idx) => ({ fileId: rewrite.fileId, idx, data }))
        );
      }
    }

    // Vault: new name ciphertext + bumped generation
    await tx
      .update(vaults)
      .set({ nameEnv: input.newVaultNameEnv, keyGeneration: newGeneration })
      .where(eq(vaults.id, input.vaultId));

    await appendAudit(tx, {
      vaultId: input.vaultId,
      actorUserId: input.actorUserId,
      type: "member_removed",
      context: { removedUserId: input.removedUserId },
    });
    await appendAudit(tx, {
      vaultId: input.vaultId,
      actorUserId: input.actorUserId,
      type: "vault_key_rotated",
      context: { newGeneration },
    });
  });
}
