import { z } from "zod";
import { approveDeviceGrant, getDb } from "@/src/lib/db";
import { json, readJson, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";
import { boxEnvelope } from "@/src/lib/api-server/validate";

type Ctx = { params: Promise<{ deviceId: string }> };

const approveSchema = z.object({ wrappedPrivKeyEnv: boxEnvelope });

/** Browser approves a device: attaches the enc.box(privateKey → devicePubKey)
 *  it produced locally. The token is issued later, at the device's first poll. */
export const POST = withRoute<Ctx>(async (request, { params }) => {
  const { deviceId } = await params;
  const { userId } = await requireSession(request);
  const body = await readJson(request, approveSchema);
  await approveDeviceGrant(getDb(), deviceId, {
    userId,
    wrappedPrivKeyEnv: body.wrappedPrivKeyEnv,
  });
  return json({ ok: true });
});
