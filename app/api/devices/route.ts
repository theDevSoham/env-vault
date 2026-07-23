import { getDb, listDeviceGrantsForUser } from "@/src/lib/db";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

/** List my approved devices (management UI, cli-key-provisioning §5). */
export const GET = withRoute(async (request) => {
  const { userId } = await requireSession(request);
  const devices = await listDeviceGrantsForUser(getDb(), userId);
  return json({ devices });
});
