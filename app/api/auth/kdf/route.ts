import { getDb, getUserByEmail, getUserKeys } from "@/src/lib/db";
import { dummyKdfParams } from "@/src/lib/api-server/dummykdf";
import { badRequest } from "@/src/lib/api-server/errors";
import { json, withRoute } from "@/src/lib/api-server/http";
import { clientIp, rateLimit } from "@/src/lib/api-server/ratelimit";
import { emailSchema } from "@/src/lib/api-server/validate";

/** Pre-login KDF parameter lookup. Unknown emails receive deterministic dummy
 *  params — the response shape never reveals account existence (T10). */
export const GET = withRoute(async (request) => {
  rateLimit(`kdf:${clientIp(request)}`, 30, 60_000);
  const email = emailSchema.safeParse(new URL(request.url).searchParams.get("email"));
  if (!email.success) throw badRequest("invalid_email");
  const user = await getUserByEmail(getDb(), email.data);
  if (!user) {
    return json({ kdfParams: await dummyKdfParams(email.data) });
  }
  const keys = await getUserKeys(getDb(), user.id);
  return json({ kdfParams: keys.kdfParams });
});
