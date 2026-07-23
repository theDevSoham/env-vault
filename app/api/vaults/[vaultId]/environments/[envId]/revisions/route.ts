import { commitRevision, getDb, getEnvironment, listRevisions } from "@/src/lib/db";
import { notFound } from "@/src/lib/api-server/errors";
import { requireVaultMember } from "@/src/lib/api-server/guard";
import { json, LARGE_BODY_LIMIT, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { commitRevisionSchema } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ vaultId: string; envId: string }> };

async function checkEnvInVault(vaultId: string, envId: string) {
  const environment = await getEnvironment(getDb(), envId);
  if (environment.vaultId !== vaultId) throw notFound(); // IDOR guard
  return environment;
}

export const GET = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId, envId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultMember(vaultId, userId);
  await checkEnvInVault(vaultId, envId);
  const revisions = await listRevisions(getDb(), envId);
  return json({ revisions });
});

/** Revision commit (handoff §30): members modify secrets; optimistic
 *  concurrency conflicts surface as 409 + currentHead for client rebase. */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId, envId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultMember(vaultId, userId);
  await checkEnvInVault(vaultId, envId);
  const body = await readJson(request, commitRevisionSchema, LARGE_BODY_LIMIT);
  const result = await commitRevision(getDb(), {
    vaultId,
    environmentId: envId,
    baseRevision: body.baseRevision,
    actorUserId: userId,
    keyGeneration: body.keyGeneration,
    message: body.message,
    snapshotEnv: body.snapshotEnv,
    diffEnv: body.diffEnv,
    restoredFromRevision: body.restoredFromRevision,
  });
  return json({ number: result.number }, 201);
});
