import { getDb, getEnvironment, getRevision } from "@/src/lib/db";
import { badRequest, notFound } from "@/src/lib/api-server/errors";
import { requireVaultMember } from "@/src/lib/api-server/guard";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

type Ctx = { params: Promise<{ vaultId: string; envId: string; number: string }> };

/** Full revision payload (snapshot + diff envelopes) for decrypt/compare/restore. */
export const GET = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId, envId, number } = await params;
  const { userId } = await requireSession(request);
  await requireVaultMember(vaultId, userId);
  const environment = await getEnvironment(getDb(), envId);
  if (environment.vaultId !== vaultId) throw notFound();
  const revisionNumber = Number.parseInt(number, 10);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) throw badRequest();
  const revision = await getRevision(getDb(), envId, revisionNumber);
  return json({ revision });
});
