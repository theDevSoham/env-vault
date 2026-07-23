import {
  deleteVault,
  getDb,
  getVault,
  listEnvironments,
  listKeyEnvelopesForMember,
} from "@/src/lib/db";
import { requireVaultMember, requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

type Ctx = { params: Promise<{ vaultId: string }> };

/** Vault detail bundle: metadata, my role, environments, my key envelopes. */
export const GET = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  const membership = await requireVaultMember(vaultId, userId);
  const [vault, environments, envelopes] = await Promise.all([
    getVault(getDb(), vaultId),
    listEnvironments(getDb(), vaultId),
    listKeyEnvelopesForMember(getDb(), vaultId, userId),
  ]);
  return json({ vault, role: membership.role, environments, envelopes });
});

export const DELETE = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  await deleteVault(getDb(), vaultId, userId);
  return json({ ok: true });
});
