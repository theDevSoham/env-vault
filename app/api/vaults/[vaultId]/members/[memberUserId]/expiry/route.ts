import { getDb, setMembershipExpiry } from "@/src/lib/db";
import { badRequest } from "@/src/lib/api-server/errors";
import { requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { membershipExpirySchema } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ vaultId: string; memberUserId: string }> };

/** Owner sets/clears a member's expiry (temporary access, machine-identities §2). */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId, memberUserId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  if (memberUserId === userId) throw badRequest("cannot_expire_self");
  const body = await readJson(request, membershipExpirySchema);
  const expiresAt = body.expiresAt === null ? null : new Date(body.expiresAt);
  if (expiresAt && expiresAt.getTime() < Date.now()) throw badRequest("expiry_in_past");
  await setMembershipExpiry(getDb(), { vaultId, memberUserId, expiresAt, actorUserId: userId });
  return json({ ok: true });
});
