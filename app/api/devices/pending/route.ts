import { getDb, getPendingGrantByCode } from "@/src/lib/db";
import { badRequest } from "@/src/lib/api-server/errors";
import { json, withRoute } from "@/src/lib/api-server/http";
import { clientIp, rateLimit } from "@/src/lib/api-server/ratelimit";
import { requireSession } from "@/src/lib/api-server/sessions";

/** Browser looks up a pending device by user code to display name + pubkey
 *  (the page computes and shows the fingerprint — cli-key-provisioning §2 step 4). */
export const GET = withRoute(async (request) => {
  await requireSession(request);
  rateLimit(`devlookup:${clientIp(request)}`, 15, 60_000);
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase().trim();
  if (!code || !/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) throw badRequest("invalid_code");
  const grant = await getPendingGrantByCode(getDb(), code);
  return json({ deviceId: grant.id, name: grant.name, devicePubKey: grant.devicePubKey });
});
