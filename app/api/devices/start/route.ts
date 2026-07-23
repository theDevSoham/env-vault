import { z } from "zod";
import { generateSessionToken, hashSessionToken } from "@/src/lib/crypto";
import { createDeviceGrant, getDb } from "@/src/lib/db";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { clientIp, rateLimit } from "@/src/lib/api-server/ratelimit";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars

const startSchema = z.object({
  name: z.string().min(1).max(120),
  devicePubKey: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/),
});

/** CLI device-authorization start (cli-key-provisioning §2 step 2). */
export const POST = withRoute(async (request) => {
  rateLimit(`devstart:${clientIp(request)}`, 5, 60_000);
  const body = await readJson(request, startSchema);
  // user code from CSPRNG bytes mapped onto the unambiguous alphabet
  const raw = await generateSessionToken();
  const bytes = Buffer.from(raw, "base64url");
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  const userCode = `${code.slice(0, 4)}-${code.slice(4)}`;
  const pollSecret = await generateSessionToken();
  const grant = await createDeviceGrant(getDb(), {
    name: body.name,
    devicePubKey: body.devicePubKey,
    userCode,
    pollSecretHash: await hashSessionToken(pollSecret),
  });
  return json({ deviceId: grant.id, userCode, pollSecret }, 201);
});
