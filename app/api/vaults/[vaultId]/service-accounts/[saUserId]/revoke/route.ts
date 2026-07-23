import { getDb, revokeServiceAccount } from "@/src/lib/db";
import { requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

type Ctx = { params: Promise<{ vaultId: string; saUserId: string }> };

export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId, saUserId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  await revokeServiceAccount(getDb(), { vaultId, serviceAccountId: saUserId, actorUserId: userId });
  return json({ ok: true });
});
