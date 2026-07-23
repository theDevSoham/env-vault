import { denyDeviceGrant, getDb } from "@/src/lib/db";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

type Ctx = { params: Promise<{ deviceId: string }> };

export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { deviceId } = await params;
  const { userId } = await requireSession(request);
  await denyDeviceGrant(getDb(), deviceId, userId);
  return json({ ok: true });
});
