import { and, eq } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { Db, DbExecutor } from "./client";
import { NotFoundError } from "./errors";
import { deviceGrants, userKeys, users, vaultMemberships, vaultKeyEnvelopes } from "./schema";

/**
 * Service accounts (ADR-009, machine-identities.md §1): a flagged user row on
 * the existing membership/envelope/guard machinery, with a device-grant row
 * (created directly in `approved` state) as its bearer credential.
 * The SA private key never reaches the server; envelopes arrive pre-wrapped
 * from the owner's browser, tokens arrive pre-hashed from the route.
 */

const SA_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

export interface CreateServiceAccountInput {
  vaultId: string;
  actorUserId: string;
  name: string;
  publicKey: string;
  envelope: unknown; // enc.box(vaultKey → SA pubkey), wrapped client-side
  vaultKeyGeneration: number;
  tokenHash: string;
  /** Unusable-by-anyone verifier (hash of random bytes) — SAs never password-login. */
  authVerifier: string;
  membershipExpiresAt?: Date | null;
}

export async function createServiceAccount(
  db: Db,
  input: CreateServiceAccountInput
): Promise<{ serviceAccountId: string }> {
  return db.transaction(async (tx) => {
    const [serviceUser] = await tx
      .insert(users)
      .values({
        email: `sa-${crypto.randomUUID()}@service.internal`,
        authVerifier: input.authVerifier,
        isService: true,
      })
      .returning({ id: users.id });
    await tx.insert(userKeys).values({
      userId: serviceUser.id,
      publicKey: input.publicKey,
      encPrivKeyEnv: {}, // placeholder — the private key exists only in the CI secret store
      kdfParams: {},
    });
    await tx.insert(vaultMemberships).values({
      vaultId: input.vaultId,
      userId: serviceUser.id,
      role: "member",
      status: "active",
      expiresAt: input.membershipExpiresAt ?? null,
    });
    await tx.insert(vaultKeyEnvelopes).values({
      vaultId: input.vaultId,
      userId: serviceUser.id,
      generation: input.vaultKeyGeneration,
      envelope: input.envelope,
    });
    await tx.insert(deviceGrants).values({
      userId: serviceUser.id,
      name: input.name,
      devicePubKey: input.publicKey,
      userCode: `SA-${crypto.randomUUID().slice(0, 13).toUpperCase()}`, // unique filler; never entered anywhere
      pollSecretHash: "-", // poll flow does not apply to SAs
      tokenHash: input.tokenHash,
      state: "approved",
      expiresAt: new Date(),
      tokenExpiresAt: new Date(Date.now() + SA_TOKEN_TTL_MS),
    });
    await appendAudit(tx, {
      vaultId: input.vaultId,
      actorUserId: input.actorUserId,
      type: "service_account_created",
      context: { serviceAccountId: serviceUser.id, name: input.name },
    });
    return { serviceAccountId: serviceUser.id };
  });
}

export async function listServiceAccounts(executor: DbExecutor, vaultId: string) {
  return executor
    .select({
      userId: users.id,
      name: deviceGrants.name,
      publicKey: userKeys.publicKey,
      membershipExpiresAt: vaultMemberships.expiresAt,
      tokenExpiresAt: deviceGrants.tokenExpiresAt,
      lastUsedAt: deviceGrants.lastUsedAt,
      createdAt: users.createdAt,
    })
    .from(vaultMemberships)
    .innerJoin(users, and(eq(vaultMemberships.userId, users.id), eq(users.isService, true)))
    .innerJoin(userKeys, eq(users.id, userKeys.userId))
    .innerJoin(deviceGrants, and(eq(deviceGrants.userId, users.id), eq(deviceGrants.state, "approved")))
    .where(and(eq(vaultMemberships.vaultId, vaultId), eq(vaultMemberships.status, "active")));
}

/** Revoke: membership deactivated + token/envelope of the grant cleared.
 *  Authorization-level — rotate the vault key for the cryptographic guarantee. */
export async function revokeServiceAccount(
  db: Db,
  input: { vaultId: string; serviceAccountId: string; actorUserId: string }
): Promise<void> {
  await db.transaction(async (tx) => {
    const [serviceUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.serviceAccountId), eq(users.isService, true)))
      .limit(1);
    if (!serviceUser) throw new NotFoundError("service account not found");
    const updated = await tx
      .update(vaultMemberships)
      .set({ status: "removed" })
      .where(
        and(
          eq(vaultMemberships.vaultId, input.vaultId),
          eq(vaultMemberships.userId, serviceUser.id),
          eq(vaultMemberships.status, "active")
        )
      )
      .returning({ id: vaultMemberships.id });
    if (updated.length === 0) throw new NotFoundError("service account not in vault");
    await tx
      .update(deviceGrants)
      .set({ state: "revoked", tokenHash: null, wrappedPrivKeyEnv: null })
      .where(and(eq(deviceGrants.userId, serviceUser.id), eq(deviceGrants.state, "approved")));
    await appendAudit(tx, {
      vaultId: input.vaultId,
      actorUserId: input.actorUserId,
      type: "service_account_revoked",
      context: { serviceAccountId: serviceUser.id },
    });
  });
}
