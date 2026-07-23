import { deleteSecretFile, getDb, getSecretFile, replaceSecretFile } from "@/src/lib/db";
import { b64urlToBytes } from "@/src/lib/api-server/codec";
import { requireVaultMember, requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, LARGE_BODY_LIMIT, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { replaceFileSchema } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ vaultId: string; fileId: string }> };

/** File metadata (encrypted name + stream envelope); chunks come separately. */
export const GET = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId, fileId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultMember(vaultId, userId);
  const file = await getSecretFile(getDb(), vaultId, fileId); // scoped query = IDOR guard
  return json({ file });
});

export const PUT = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId, fileId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  const body = await readJson(request, replaceFileSchema, LARGE_BODY_LIMIT);
  await replaceSecretFile(getDb(), fileId, {
    vaultId,
    actorUserId: userId,
    streamEnv: body.streamEnv,
    keyGeneration: body.keyGeneration,
    chunks: body.chunks.map(b64urlToBytes),
  });
  return json({ ok: true });
});

export const DELETE = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId, fileId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  await deleteSecretFile(getDb(), fileId, { vaultId, actorUserId: userId });
  return json({ ok: true });
});
