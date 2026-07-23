import { attachEnvelopeAndActivate, getDb, getInvitation, getUserByEmail } from "@/src/lib/db";
import { notFound } from "@/src/lib/api-server/errors";
import { requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { activateInvitationSchema } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ invitationId: string }> };

/** Owner's deferred wrap (Flow B step 3, ADR-005): attach the enc.box wrapped
 *  for the invitee's now-existing public key; membership activates atomically. */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { invitationId } = await params;
  const { userId } = await requireSession(request);
  const invitation = await getInvitation(getDb(), invitationId);
  await requireVaultOwner(invitation.vaultId, userId);
  const body = await readJson(request, activateInvitationSchema);
  const invitee = await getUserByEmail(getDb(), invitation.inviteeEmail);
  if (!invitee) throw notFound();
  await attachEnvelopeAndActivate(getDb(), invitationId, {
    inviteeUserId: invitee.id,
    envelope: body.envelope,
    actorUserId: userId,
  });
  return json({ ok: true });
});
