import { z } from "zod";
import { generateSessionToken, hashSessionToken } from "@/src/lib/crypto";
import { getDb, getGrantForPoll, issueDeviceToken } from "@/src/lib/db";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { clientIp, rateLimit } from "@/src/lib/api-server/ratelimit";

const pollSchema = z.object({
  deviceId: z.string().uuid(),
  pollSecret: z.string().min(1).max(200),
});

/**
 * CLI polls for approval (cli-key-provisioning §2 steps 5–6). The bearer token
 * is generated HERE, on the first poll that observes approval — an atomic
 * tokenHash-IS-NULL claim makes delivery one-shot, and plaintext token
 * material never exists at rest. Poll is authenticated by the pollSecret.
 */
export const POST = withRoute(async (request) => {
  rateLimit(`devpoll:${clientIp(request)}`, 30, 60_000);
  const body = await readJson(request, pollSchema);
  const grant = await getGrantForPoll(
    getDb(),
    body.deviceId,
    await hashSessionToken(body.pollSecret)
  );
  if (grant.state === "pending") {
    if (grant.expiresAt.getTime() < Date.now()) return json({ state: "expired" });
    return json({ state: "pending" });
  }
  if (grant.state !== "approved") return json({ state: grant.state });
  const token = await generateSessionToken();
  const claimed = await issueDeviceToken(getDb(), grant.id, await hashSessionToken(token));
  if (!claimed) return json({ state: "consumed" }); // token already delivered once
  return json({ state: "approved", token, wrappedPrivKeyEnv: grant.wrappedPrivKeyEnv });
});
