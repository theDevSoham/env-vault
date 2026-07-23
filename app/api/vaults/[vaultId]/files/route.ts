import { createSecretFile, getDb, listSecretFiles } from "@/src/lib/db";
import { b64urlToBytes } from "@/src/lib/api-server/codec";
import { requireVaultMember, requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, LARGE_BODY_LIMIT, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { createFileSchema } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ vaultId: string }> };

export const GET = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultMember(vaultId, userId); // members access files (handoff §6)
  const files = await listSecretFiles(getDb(), vaultId);
  return json({ files });
});

/** Upload encrypted file (handoff §22): owner-only management (handoff §6). */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  const body = await readJson(request, createFileSchema, LARGE_BODY_LIMIT);
  const file = await createSecretFile(getDb(), {
    id: body.fileId,
    vaultId,
    actorUserId: userId,
    nameEnv: body.nameEnv,
    streamEnv: body.streamEnv,
    keyGeneration: body.keyGeneration,
    chunks: body.chunks.map(b64urlToBytes),
  });
  return json({ fileId: file.id }, 201);
});
