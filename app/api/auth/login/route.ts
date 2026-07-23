import { hashAuthKey, verifyAuthKey } from "@/src/lib/crypto";
import { getDb, getUserByEmail } from "@/src/lib/db";
import { unauthorized } from "@/src/lib/api-server/errors";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { clientIp, rateLimit } from "@/src/lib/api-server/ratelimit";
import { createSession } from "@/src/lib/api-server/sessions";
import { loginSchema } from "@/src/lib/api-server/validate";

/** Verifier for a throwaway key — verified against on unknown-email logins so
 *  the Argon2id cost is paid on both paths (timing-based enumeration, SR-2). */
let dummyVerifier: string | null = null;
async function getDummyVerifier(): Promise<string> {
  if (!dummyVerifier) dummyVerifier = await hashAuthKey("dummy-timing-equalizer");
  return dummyVerifier;
}

export const POST = withRoute(async (request) => {
  const body = await readJson(request, loginSchema);
  rateLimit(`login:${clientIp(request)}`, 20, 60_000);
  rateLimit(`login:${body.email.toLowerCase()}`, 10, 60_000);
  const user = await getUserByEmail(getDb(), body.email);
  // Uniform failure path: unknown email burns the same Argon2id verify cost
  // as a wrong authKey, and both produce an identical 401.
  if (!user) {
    await verifyAuthKey(body.authKey, await getDummyVerifier());
    throw unauthorized();
  }
  if (!(await verifyAuthKey(body.authKey, user.authVerifier))) {
    throw unauthorized();
  }
  const { cookie } = await createSession(user.id);
  return json({ userId: user.id }, 200, { "set-cookie": cookie });
});
