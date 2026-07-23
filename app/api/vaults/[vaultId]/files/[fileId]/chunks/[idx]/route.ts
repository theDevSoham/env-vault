import { getDb, getSecretFile } from "@/src/lib/db";
import { PostgresBlobStore } from "@/src/lib/storage";
import { badRequest, notFound } from "@/src/lib/api-server/errors";
import { requireVaultMember } from "@/src/lib/api-server/guard";
import { withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

type Ctx = { params: Promise<{ vaultId: string; fileId: string; idx: string }> };

/** Download one ciphertext chunk (binary). The client decrypts via the
 *  secretstream; the server streams opaque bytes only. */
export const GET = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId, fileId, idx } = await params;
  const { userId } = await requireSession(request);
  await requireVaultMember(vaultId, userId);
  await getSecretFile(getDb(), vaultId, fileId); // 404 unless file belongs to vault
  const index = Number.parseInt(idx, 10);
  if (!Number.isInteger(index) || index < 0) throw badRequest();
  const chunk = await new PostgresBlobStore(getDb()).getChunk(fileId, index);
  if (!chunk) throw notFound();
  return new Response(Buffer.from(chunk), {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
