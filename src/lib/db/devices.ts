import { and, eq, isNotNull, sql } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { Db, DbExecutor } from "./client";
import { InvitationStateError, NotFoundError } from "./errors";
import { deviceGrants } from "./schema";

/**
 * CLI device grants (cli-key-provisioning.md §3). All secrets arrive here
 * pre-hashed (poll secret, bearer token) or as sealed-box ciphertext
 * (wrappedPrivKeyEnv) — this module stores and transitions state only.
 */

const GRANT_TTL_MS = 10 * 60 * 1000; // pending grant: 10 minutes

export async function createDeviceGrant(
  executor: DbExecutor,
  input: { name: string; devicePubKey: string; userCode: string; pollSecretHash: string }
): Promise<{ id: string }> {
  const [grant] = await executor
    .insert(deviceGrants)
    .values({ ...input, expiresAt: new Date(Date.now() + GRANT_TTL_MS) })
    .returning({ id: deviceGrants.id });
  return grant;
}

export async function getPendingGrantByCode(executor: DbExecutor, userCode: string) {
  const rows = await executor
    .select()
    .from(deviceGrants)
    .where(and(eq(deviceGrants.userCode, userCode), eq(deviceGrants.state, "pending")))
    .limit(1);
  const grant = rows[0];
  if (!grant || grant.expiresAt.getTime() < Date.now()) throw new NotFoundError("code not found");
  return grant;
}

/** Approve: bind to the approving user and attach the envelope. No token yet —
 *  the bearer token is generated at the device's first poll after approval, so
 *  plaintext token material never exists at rest (poll is pollSecret-authenticated). */
export async function approveDeviceGrant(
  db: Db,
  grantId: string,
  input: { userId: string; wrappedPrivKeyEnv: unknown }
): Promise<void> {
  await db.transaction(async (tx) => {
    const [grant] = await tx
      .select()
      .from(deviceGrants)
      .where(eq(deviceGrants.id, grantId))
      .for("update");
    if (!grant) throw new NotFoundError("grant not found");
    if (grant.state !== "pending" || grant.expiresAt.getTime() < Date.now()) {
      throw new InvitationStateError("grant is not pending");
    }
    await tx
      .update(deviceGrants)
      .set({
        userId: input.userId,
        wrappedPrivKeyEnv: input.wrappedPrivKeyEnv,
        state: "approved",
      })
      .where(eq(deviceGrants.id, grantId));
    await appendAudit(tx, {
      vaultId: null,
      actorUserId: input.userId,
      type: "device_approved",
      context: { deviceId: grantId, deviceName: grant.name },
    });
  });
}

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days (cli-key-provisioning §5)

/** First poll after approval: atomically claim token issuance (tokenHash IS NULL
 *  guard makes this one-shot) and return whether this poll won the claim. */
export async function issueDeviceToken(
  executor: DbExecutor,
  grantId: string,
  tokenHash: string
): Promise<boolean> {
  const updated = await executor
    .update(deviceGrants)
    .set({ tokenHash, tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS) })
    .where(
      and(
        eq(deviceGrants.id, grantId),
        eq(deviceGrants.state, "approved"),
        sql`${deviceGrants.tokenHash} is null`
      )
    )
    .returning({ id: deviceGrants.id });
  return updated.length > 0;
}

export async function denyDeviceGrant(db: Db, grantId: string, actorUserId: string): Promise<void> {
  const updated = await getDbUpdateState(db, grantId, "pending", "denied");
  if (!updated) throw new InvitationStateError("grant is not pending");
  void actorUserId;
}

/** Poll path: match id + poll-secret hash; deliver token/envelope only when approved. */
export async function getGrantForPoll(executor: DbExecutor, grantId: string, pollSecretHash: string) {
  const rows = await executor
    .select()
    .from(deviceGrants)
    .where(and(eq(deviceGrants.id, grantId), eq(deviceGrants.pollSecretHash, pollSecretHash)))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("grant not found");
  return rows[0];
}

/** Bearer-token resolution for API auth. Returns null when invalid/expired/revoked. */
export async function getUserIdForDeviceToken(
  executor: DbExecutor,
  tokenHash: string
): Promise<string | null> {
  const rows = await executor
    .select()
    .from(deviceGrants)
    .where(
      and(
        eq(deviceGrants.tokenHash, tokenHash),
        eq(deviceGrants.state, "approved"),
        isNotNull(deviceGrants.userId)
      )
    )
    .limit(1);
  const grant = rows[0];
  if (!grant) return null;
  if (grant.tokenExpiresAt && grant.tokenExpiresAt.getTime() < Date.now()) return null;
  await executor
    .update(deviceGrants)
    .set({ lastUsedAt: new Date() })
    .where(eq(deviceGrants.id, grant.id));
  return grant.userId;
}

export async function listDeviceGrantsForUser(executor: DbExecutor, userId: string) {
  return executor
    .select({
      id: deviceGrants.id,
      name: deviceGrants.name,
      state: deviceGrants.state,
      createdAt: deviceGrants.createdAt,
      lastUsedAt: deviceGrants.lastUsedAt,
      devicePubKey: deviceGrants.devicePubKey,
    })
    .from(deviceGrants)
    .where(and(eq(deviceGrants.userId, userId), eq(deviceGrants.state, "approved")));
}

/** Revoke: clear token + envelope; the row remains for the audit trail. */
export async function revokeDeviceGrant(db: Db, grantId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(deviceGrants)
      .set({ state: "revoked", tokenHash: null, wrappedPrivKeyEnv: null })
      .where(
        and(
          eq(deviceGrants.id, grantId),
          eq(deviceGrants.userId, userId),
          eq(deviceGrants.state, "approved")
        )
      )
      .returning({ id: deviceGrants.id, name: deviceGrants.name });
    if (updated.length === 0) throw new NotFoundError("device not found");
    await appendAudit(tx, {
      vaultId: null,
      actorUserId: userId,
      type: "device_revoked",
      context: { deviceId: grantId, deviceName: updated[0].name },
    });
  });
}

async function getDbUpdateState(
  db: Db,
  grantId: string,
  from: string,
  to: string
): Promise<boolean> {
  const updated = await db
    .update(deviceGrants)
    .set({ state: to })
    .where(and(eq(deviceGrants.id, grantId), eq(deviceGrants.state, from), sql`${deviceGrants.expiresAt} > now()`))
    .returning({ id: deviceGrants.id });
  return updated.length > 0;
}
