import { getDb, listActiveMembers } from "@/src/lib/db";
import { requireVaultMember } from "@/src/lib/api-server/guard";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

type Ctx = { params: Promise<{ vaultId: string }> };

export const GET = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultMember(vaultId, userId);
  const members = await listActiveMembers(getDb(), vaultId);
  return json({ members });
});
