import { eq } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { Db, DbExecutor } from "./client";
import { NotFoundError } from "./errors";
import { environments } from "./schema";

export async function createEnvironment(
  db: Db,
  input: { vaultId: string; nameEnv: unknown; actorUserId: string }
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [env] = await tx
      .insert(environments)
      .values({ vaultId: input.vaultId, nameEnv: input.nameEnv })
      .returning({ id: environments.id });
    await appendAudit(tx, {
      vaultId: input.vaultId,
      actorUserId: input.actorUserId,
      type: "environment_created",
      context: { environmentId: env.id },
    });
    return env;
  });
}

export async function getEnvironment(executor: DbExecutor, environmentId: string) {
  const rows = await executor
    .select()
    .from(environments)
    .where(eq(environments.id, environmentId))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("environment not found");
  return rows[0];
}

/** Deletes the environment and (by cascade) its revisions. Deliberate V1 choice:
 *  environment deletion destroys its history — the audit trail records the act. */
export async function deleteEnvironment(
  db: Db,
  environmentId: string,
  actorUserId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(environments)
      .where(eq(environments.id, environmentId))
      .returning({ id: environments.id, vaultId: environments.vaultId });
    if (deleted.length === 0) throw new NotFoundError("environment not found");
    await appendAudit(tx, {
      vaultId: deleted[0].vaultId,
      actorUserId,
      type: "environment_deleted",
      context: { environmentId },
    });
  });
}
