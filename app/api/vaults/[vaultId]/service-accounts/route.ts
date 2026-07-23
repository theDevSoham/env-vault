import { generateSessionToken, hashAuthKey, hashSessionToken } from "@/src/lib/crypto";
import { createServiceAccount, getDb, getVault, listServiceAccounts } from "@/src/lib/db";
import { badRequest } from "@/src/lib/api-server/errors";
import { requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { createServiceAccountSchema } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ vaultId: string }> };

export const GET = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  const serviceAccounts = await listServiceAccounts(getDb(), vaultId);
  return json({ serviceAccounts });
});

/** Create a service account (machine-identities §1). The envelope arrives
 *  pre-wrapped from the owner's browser; the bearer token is returned exactly
 *  once — the server keeps only its hash. */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  const body = await readJson(request, createServiceAccountSchema);
  const vault = await getVault(getDb(), vaultId);
  if (body.keyGeneration !== vault.keyGeneration) {
    throw badRequest("stale_key_generation"); // wrap must target the current key
  }
  const token = await generateSessionToken();
  const { serviceAccountId } = await createServiceAccount(getDb(), {
    vaultId,
    actorUserId: userId,
    name: body.name,
    publicKey: body.publicKey,
    envelope: body.envelope,
    vaultKeyGeneration: body.keyGeneration,
    tokenHash: await hashSessionToken(token),
    authVerifier: await hashAuthKey(await generateSessionToken()), // unusable by anyone
    membershipExpiresAt: body.membershipTtlDays
      ? new Date(Date.now() + body.membershipTtlDays * 86_400_000)
      : null,
  });
  return json({ serviceAccountId, token }, 201);
});
