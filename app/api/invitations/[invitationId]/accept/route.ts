import { eq } from "drizzle-orm";
import { acceptInvitation, getDb, getInvitation } from "@/src/lib/db";
import { users } from "@/src/lib/db/schema";
import { notFound } from "@/src/lib/api-server/errors";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

type Ctx = { params: Promise<{ invitationId: string }> };

/** Invitee accepts. Only the account whose email matches the invitation may
 *  accept (single-use, bound to the invited address — sharing-protocol §7). */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { invitationId } = await params;
  const { userId } = await requireSession(request);
  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound();
  const invitation = await getInvitation(getDb(), invitationId);
  if (invitation.inviteeEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw notFound(); // not addressed to this account; don't reveal existence
  }
  const result = await acceptInvitation(getDb(), invitationId, userId);
  return json({ state: result.state });
});
