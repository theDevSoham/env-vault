import { deleteEnvironment, getDb, getEnvironment } from "@/src/lib/db";
import { notFound } from "@/src/lib/api-server/errors";
import { requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

type Ctx = { params: Promise<{ vaultId: string; envId: string }> };

export const DELETE = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId, envId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  const environment = await getEnvironment(getDb(), envId);
  if (environment.vaultId !== vaultId) throw notFound(); // IDOR guard
  await deleteEnvironment(getDb(), envId, userId);
  return json({ ok: true });
});
