import { hashAuthKey, verifyAuthKey } from "@/src/lib/crypto";
import { getDb, updateUserCredentials } from "@/src/lib/db";
import { eq } from "drizzle-orm";
import { users } from "@/src/lib/db/schema";
import { unauthorized } from "@/src/lib/api-server/errors";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { clientIp, rateLimit } from "@/src/lib/api-server/ratelimit";
import {
  createSession,
  destroyAllSessionsForUser,
  requireSession,
} from "@/src/lib/api-server/sessions";
import { changePasswordSchema } from "@/src/lib/api-server/validate";

/** Password change / KDF upgrade (lifecycle §3–4): verifies the old authKey,
 *  swaps verifier + KDF params + re-encrypted private key atomically, then
 *  invalidates every session and issues a fresh one. */
export const POST = withRoute(async (request) => {
  const { userId } = await requireSession(request);
  rateLimit(`chpw:${clientIp(request)}`, 5, 60_000);
  const body = await readJson(request, changePasswordSchema);

  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await verifyAuthKey(body.oldAuthKey, user.authVerifier))) {
    throw unauthorized();
  }
  await updateUserCredentials(getDb(), userId, {
    authVerifier: await hashAuthKey(body.newAuthKey),
    kdfParams: body.newKdfParams,
    encPrivKeyEnv: body.newEncPrivKeyEnv,
  });
  await destroyAllSessionsForUser(userId);
  const { cookie } = await createSession(userId);
  return json({ ok: true }, 200, { "set-cookie": cookie });
});
