import { commitKeyRotation, getDb } from "@/src/lib/db";
import { b64urlToBytes } from "@/src/lib/api-server/codec";
import { requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, LARGE_BODY_LIMIT, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { rotationSchema } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ vaultId: string }> };

/** Atomic member-removal + key-rotation commit (revocation-protocol §3).
 *  All cryptography happened in the owner's client; the server validates the
 *  envelope set and applies everything in one transaction. */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId);
  const body = await readJson(request, rotationSchema, LARGE_BODY_LIMIT);
  await commitKeyRotation(getDb(), {
    vaultId,
    actorUserId: userId,
    baseGeneration: body.baseGeneration,
    removedUserId: body.removedUserId,
    newVaultNameEnv: body.newVaultNameEnv,
    newEnvelopes: body.newEnvelopes,
    newRevisions: body.newRevisions,
    fileRewrites: body.fileRewrites.map((f) => ({
      fileId: f.fileId,
      streamEnv: f.streamEnv,
      sizeBytes: f.chunks.reduce((sum, c) => sum + b64urlToBytes(c).length, 0),
      chunks: f.chunks.map(b64urlToBytes),
    })),
  });
  return json({ ok: true });
});
