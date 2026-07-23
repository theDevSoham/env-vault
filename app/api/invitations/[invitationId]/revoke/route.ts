import { getDb, getInvitation, revokeInvitation } from "@/src/lib/db";
import { requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

type Ctx = { params: Promise<{ invitationId: string }> };

export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { invitationId } = await params;
  const { userId } = await requireSession(request);
  const invitation = await getInvitation(getDb(), invitationId);
  await requireVaultOwner(invitation.vaultId, userId);
  await revokeInvitation(getDb(), invitationId, userId);
  return json({ ok: true });
});
