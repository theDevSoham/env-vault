import { and, desc, eq } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { Db, DbExecutor } from "./client";
import { NotFoundError, RevisionConflictError } from "./errors";
import { environments, revisions } from "./schema";

/**
 * Immutable revision history (revision-model §1–2). Append-only: no update or
 * delete exists here, and migration 0001's trigger enforces it in the DB.
 */

export interface CommitRevisionInput {
  vaultId: string;
  environmentId: string;
  /** The revision number the client based its change on (optimistic concurrency). */
  baseRevision: number;
  actorUserId: string;
  keyGeneration: number;
  message?: string;
  snapshotEnv: unknown; // enc.rec
  diffEnv: unknown; // enc.rec
  /** Marks a restore commit (revision-model §3) for the audit trail. */
  restoredFromRevision?: number;
}

/**
 * Commit one revision (handoff §30): locks the environment row, rejects if the
 * head moved past baseRevision, otherwise appends revision baseRevision+1 and
 * advances the head — all in one transaction. Never overwrites.
 */
export async function commitRevision(
  db: Db,
  input: CommitRevisionInput
): Promise<{ number: number }> {
  return db.transaction(async (tx) => {
    const [env] = await tx
      .select({ head: environments.headRevision, vaultId: environments.vaultId })
      .from(environments)
      .where(eq(environments.id, input.environmentId))
      .for("update");
    if (!env) throw new NotFoundError("environment not found");
    if (env.head !== input.baseRevision) {
      throw new RevisionConflictError(env.head);
    }
    const number = input.baseRevision + 1;
    await tx.insert(revisions).values({
      vaultId: input.vaultId,
      environmentId: input.environmentId,
      number,
      actorUserId: input.actorUserId,
      keyGeneration: input.keyGeneration,
      message: input.message ?? null,
      snapshotEnv: input.snapshotEnv,
      diffEnv: input.diffEnv,
    });
    await tx
      .update(environments)
      .set({ headRevision: number })
      .where(eq(environments.id, input.environmentId));
    await appendAudit(tx, {
      vaultId: input.vaultId,
      actorUserId: input.actorUserId,
      type: input.restoredFromRevision ? "revision_restored" : "revision_created",
      context: {
        environmentId: input.environmentId,
        revision: number,
        ...(input.restoredFromRevision ? { restoredFrom: input.restoredFromRevision } : {}),
      },
    });
    return { number };
  });
}

/** Revision list for history UI — metadata + diff envelope, without snapshots. */
export async function listRevisions(executor: DbExecutor, environmentId: string, limit = 50) {
  return executor
    .select({
      id: revisions.id,
      number: revisions.number,
      actorUserId: revisions.actorUserId,
      keyGeneration: revisions.keyGeneration,
      message: revisions.message,
      diffEnv: revisions.diffEnv,
      createdAt: revisions.createdAt,
    })
    .from(revisions)
    .where(eq(revisions.environmentId, environmentId))
    .orderBy(desc(revisions.number))
    .limit(limit);
}

export async function getRevision(executor: DbExecutor, environmentId: string, number: number) {
  const rows = await executor
    .select()
    .from(revisions)
    .where(and(eq(revisions.environmentId, environmentId), eq(revisions.number, number)))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("revision not found");
  return rows[0];
}
