import { getDb, getUserByEmail, getUserKeys } from "@/src/lib/db";
import { badRequest, notFound } from "@/src/lib/api-server/errors";
import { json, withRoute } from "@/src/lib/api-server/http";
import { clientIp, rateLimit } from "@/src/lib/api-server/ratelimit";
import { requireSession } from "@/src/lib/api-server/sessions";
import { emailSchema } from "@/src/lib/api-server/validate";

/** Public-key lookup by email for envelope wrapping (sharing-protocol §3).
 *  Authenticated + rate-limited; the UI displays the key fingerprint (T9). */
export const GET = withRoute(async (request) => {
  await requireSession(request);
  rateLimit(`pubkey:${clientIp(request)}`, 30, 60_000);
  const email = emailSchema.safeParse(new URL(request.url).searchParams.get("email"));
  if (!email.success) throw badRequest("invalid_email");
  const user = await getUserByEmail(getDb(), email.data);
  if (!user) throw notFound();
  const keys = await getUserKeys(getDb(), user.id);
  return json({ userId: user.id, publicKey: keys.publicKey });
});
