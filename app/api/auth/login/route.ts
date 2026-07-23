import { verifyAuthKey } from "@/src/lib/crypto";
import { getDb, getUserByEmail } from "@/src/lib/db";
import { unauthorized } from "@/src/lib/api-server/errors";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { clientIp, rateLimit } from "@/src/lib/api-server/ratelimit";
import { createSession } from "@/src/lib/api-server/sessions";
import { loginSchema } from "@/src/lib/api-server/validate";

export const POST = withRoute(async (request) => {
  const body = await readJson(request, loginSchema);
  rateLimit(`login:${clientIp(request)}`, 20, 60_000);
  rateLimit(`login:${body.email.toLowerCase()}`, 10, 60_000);
  const user = await getUserByEmail(getDb(), body.email);
  // Uniform failure path: unknown email and wrong authKey are indistinguishable.
  if (!user || !(await verifyAuthKey(body.authKey, user.authVerifier))) {
    throw unauthorized();
  }
  const { cookie } = await createSession(user.id);
  return json({ userId: user.id }, 200, { "set-cookie": cookie });
});
