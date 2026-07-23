import { createEnvironment, getDb } from "@/src/lib/db";
import { requireVaultOwner } from "@/src/lib/api-server/guard";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { createEnvironmentSchema } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ vaultId: string }> };

export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { vaultId } = await params;
  const { userId } = await requireSession(request);
  await requireVaultOwner(vaultId, userId); // owner manages environments (handoff §6)
  const body = await readJson(request, createEnvironmentSchema);
  const environment = await createEnvironment(getDb(), {
    id: body.environmentId,
    vaultId,
    nameEnv: body.nameEnv,
    actorUserId: userId,
  });
  return json({ environmentId: environment.id }, 201);
});
