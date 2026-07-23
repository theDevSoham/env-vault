import { eq, sql } from "drizzle-orm";
import type { Db, DbExecutor } from "./client";
import { NotFoundError } from "./errors";
import { userKeys, users } from "./schema";

/**
 * Users + cryptographic identity records (account-key-lifecycle §1).
 * Stored: email, authVerifier (server-side hash of the client-derived authKey —
 * NEVER a password), public key, KEK-encrypted private key envelope, KDF params.
 */

export interface CreateUserInput {
  email: string;
  authVerifier: string;
  publicKey: string;
  encPrivKeyEnv: unknown;
  kdfParams: unknown;
}

export async function createUser(db: Db, input: CreateUserInput): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, authVerifier: input.authVerifier })
      .returning({ id: users.id });
    await tx.insert(userKeys).values({
      userId: user.id,
      publicKey: input.publicKey,
      encPrivKeyEnv: input.encPrivKeyEnv,
      kdfParams: input.kdfParams,
    });
    return user;
  });
}

export async function getUserByEmail(executor: DbExecutor, email: string) {
  const rows = await executor
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserKeys(executor: DbExecutor, userId: string) {
  const rows = await executor.select().from(userKeys).where(eq(userKeys.userId, userId)).limit(1);
  if (!rows[0]) throw new NotFoundError("user keys not found");
  return rows[0];
}

/** Public key lookup for envelope wrapping by inviter clients (sharing-protocol). */
export async function getPublicKey(executor: DbExecutor, userId: string): Promise<string> {
  const keys = await getUserKeys(executor, userId);
  return keys.publicKey;
}

/**
 * Password change / KDF upgrade (account-key-lifecycle §3–4): verifier, KDF
 * params and re-encrypted private key replaced in ONE transaction.
 */
export async function updateUserCredentials(
  db: Db,
  userId: string,
  input: { authVerifier: string; kdfParams: unknown; encPrivKeyEnv: unknown }
): Promise<void> {
  await db.transaction(async (tx) => {
    const updatedUsers = await tx
      .update(users)
      .set({ authVerifier: input.authVerifier })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (updatedUsers.length === 0) throw new NotFoundError("user not found");
    await tx
      .update(userKeys)
      .set({
        kdfParams: input.kdfParams,
        encPrivKeyEnv: input.encPrivKeyEnv,
        updatedAt: new Date(),
      })
      .where(eq(userKeys.userId, userId));
  });
}
