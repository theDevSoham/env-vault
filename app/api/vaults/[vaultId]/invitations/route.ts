import { createInvitation, getDb, listInvitationsForVault } from "@/src/lib/db";
import { requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { createInvitationSchema } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ vaultId: string }> };

/** Owner's invitation management view (includes Flow B awaiting-wrap entries). */
export const GET = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  const invitations = await listInvitationsForVault(getDb(), vaultId);
  return json({ invitations });
});

/** Create invitation (sharing-protocol §3–4). Flow A sends the wrapped
 *  envelope now; Flow B omits it (deferred wrap, ADR-005). */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  const body = await readJson(request, createInvitationSchema);
  const invitation = await createInvitation(getDb(), {
    vaultId,
    inviteeEmail: body.inviteeEmail,
    role: body.role,
    invitedByUserId: userId,
    envelope: body.envelope,
    membershipExpiresAt: body.membershipTtlDays
      ? new Date(Date.now() + body.membershipTtlDays * 86_400_000)
      : null,
  });
  return json({ invitationId: invitation.id }, 201);
});
