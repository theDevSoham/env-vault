import { createVault, getDb, listVaultsForUser } from "@/src/lib/db";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { createVaultSchema } from "@/src/lib/api-server/validate";

export const GET = withRoute(async (request) => {
  const { userId } = await requireSession(request);
  const vaults = await listVaultsForUser(getDb(), userId);
  return json({ vaults });
});

/** Vault creation (handoff §17): the client generated + wrapped the vault key;
 *  the server stores metadata and the owner's envelope, nothing more. */
export const POST = withRoute(async (request) => {
  const { userId } = await requireSession(request);
  const body = await readJson(request, createVaultSchema);
  const vault = await createVault(getDb(), {
    id: body.vaultId,
    ownerUserId: userId,
    nameEnv: body.nameEnv,
    ownerEnvelope: body.ownerEnvelope,
  });
  return json({ vaultId: vault.id }, 201);
});
