import { appendAudit, getDb, getEnvironment } from "@/src/lib/db";
import { notFound } from "@/src/lib/api-server/errors";
import { requireVaultMember } from "@/src/lib/api-server/guard";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { exportAuditSchema } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ vaultId: string }> };

/** Export happens entirely client-side (handoff §8); this endpoint only
 *  records the audit event (metadata: environment + format, never content). */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultMember(vaultId, userId);
  const body = await readJson(request, exportAuditSchema);
  const environment = await getEnvironment(getDb(), body.environmentId);
  if (environment.vaultId !== vaultId) throw notFound();
  await appendAudit(getDb(), {
    vaultId,
    actorUserId: userId,
    type: "export_requested",
    context: { environmentId: body.environmentId, format: body.format },
  });
  return json({ ok: true });
});
