import { eq } from "drizzle-orm";
import { getDb, getUserKeys } from "@/src/lib/db";
import { users } from "@/src/lib/db/schema";
import { notFound } from "@/src/lib/api-server/errors";
import { json, withRoute } from "@/src/lib/api-server/http";
import { requireSession } from "@/src/lib/api-server/sessions";

/** Own identity material for unlock: public key, encrypted private key, KDF params. */
export const GET = withRoute(async (request) => {
  const { userId } = await requireSession(request);
  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound();
  const keys = await getUserKeys(getDb(), userId);
  return json({
    userId,
    email: user.email,
    publicKey: keys.publicKey,
    encPrivKeyEnv: keys.encPrivKeyEnv,
    kdfParams: keys.kdfParams,
  });
});
