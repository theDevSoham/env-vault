import { getDb, revokeDeviceGrant } from "@/src/lib/db";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

type Ctx = { params: Promise<{ deviceId: string }> };

/** Revoke a device: token + envelope deleted. Honest limitation (doc §5): a
 *  device that already unwrapped the key may retain it — rotate vaults for
 *  cryptographic certainty; the devices UI says exactly that. */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { deviceId } = await params;
  const { userId } = await requireSession(request);
  await revokeDeviceGrant(getDb(), deviceId, userId);
  return json({ ok: true });
});
