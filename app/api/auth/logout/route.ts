import { json, withRoute } from "@/src/lib/api-server/http";
import { clearSessionCookie, destroySession } from "@/src/lib/api-server/sessions";

export const POST = withRoute(async (request) => {
  await destroySession(request);
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
});
