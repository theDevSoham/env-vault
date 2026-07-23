import { hashAuthKey } from "@/src/lib/crypto";
import { createUser, getDb, getUserByEmail } from "@/src/lib/db";
import { badRequest } from "@/src/lib/api-server/errors";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { clientIp, rateLimit } from "@/src/lib/api-server/ratelimit";
import { createSession } from "@/src/lib/api-server/sessions";
import { signupSchema } from "@/src/lib/api-server/validate";

export const POST = withRoute(async (request) => {
  rateLimit(`signup:${clientIp(request)}`, 5, 60_000);
  const body = await readJson(request, signupSchema);
  if (await getUserByEmail(getDb(), body.email)) {
    throw badRequest("email_taken");
  }
  const authVerifier = await hashAuthKey(body.authKey);
  const user = await createUser(getDb(), {
    email: body.email,
    authVerifier,
    publicKey: body.publicKey,
    encPrivKeyEnv: body.encPrivKeyEnv,
    kdfParams: body.kdfParams,
  });
  const { cookie } = await createSession(user.id);
  return json({ userId: user.id }, 201, { "set-cookie": cookie });
});
