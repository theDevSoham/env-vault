import { eq } from "drizzle-orm";
import { getDb, listInvitationsForEmail } from "@/src/lib/db";
import { users } from "@/src/lib/db/schema";
import { notFound } from "@/src/lib/api-server/errors";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

/** Pending invitations addressed to my email. Vault names are encrypted and
 *  the invitee holds no key yet, so entries show inviter + role only (ADR-004). */
export const GET = withRoute(async (request) => {
  const { userId } = await requireSession(request);
  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound();
  const invitations = await listInvitationsForEmail(getDb(), user.email);
  return json({
    invitations: invitations.map((i) => ({
      id: i.id,
      role: i.role,
      state: i.state,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
  });
});
