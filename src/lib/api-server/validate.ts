import { z } from "zod";
import {
  assertBoxEnvelope,
  assertRecordEnvelope,
  assertStreamEnvelope,
} from "../crypto";

/**
 * Request-body schemas (plannings/04 D3). Envelope fields are validated
 * structurally via the crypto module's assertions — the server checks shape,
 * never content (it can't: it's ciphertext).
 */

const envelopeOf = (assert: (x: unknown) => unknown, label: string) =>
  z.unknown().superRefine((value, ctx) => {
    try {
      assert(value);
    } catch {
      ctx.addIssue({ code: "custom", message: `invalid ${label}` });
    }
  });

export const recEnvelope = envelopeOf(assertRecordEnvelope, "record envelope");
export const boxEnvelope = envelopeOf(assertBoxEnvelope, "box envelope");
export const streamEnvelope = envelopeOf(assertStreamEnvelope, "stream envelope");

export const emailSchema = z.string().email().max(320);
const b64 = z.string().min(1).max(200_000).regex(/^[A-Za-z0-9_-]+$/);

export const kdfParamsSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal("argon2id13"),
    salt: z.string().min(1).max(64),
    ops: z.number().int().positive(),
    mem: z.number().int().positive(),
    outLen: z.literal(32),
  })
  .strict();

export const signupSchema = z.object({
  email: emailSchema,
  authKey: b64,
  kdfParams: kdfParamsSchema,
  publicKey: b64,
  encPrivKeyEnv: recEnvelope,
});

export const loginSchema = z.object({ email: emailSchema, authKey: b64 });

export const changePasswordSchema = z.object({
  oldAuthKey: b64,
  newAuthKey: b64,
  newKdfParams: kdfParamsSchema,
  newEncPrivKeyEnv: recEnvelope,
});

export const createVaultSchema = z.object({
  vaultId: z.string().uuid(), // client-generated: AAD binds the encrypted name to it
  nameEnv: recEnvelope,
  ownerEnvelope: boxEnvelope,
});

export const createEnvironmentSchema = z.object({
  environmentId: z.string().uuid(),
  nameEnv: recEnvelope,
});

export const commitRevisionSchema = z.object({
  baseRevision: z.number().int().min(0),
  keyGeneration: z.number().int().positive(),
  message: z.string().max(500).optional(),
  snapshotEnv: recEnvelope,
  diffEnv: recEnvelope,
  restoredFromRevision: z.number().int().positive().optional(),
});

export const createInvitationSchema = z.object({
  inviteeEmail: emailSchema,
  role: z.enum(["owner", "member"]),
  envelope: boxEnvelope.optional(),
  /** Temporary access: membership lifetime in days from activation (1–365). */
  membershipTtlDays: z.number().int().min(1).max(365).optional(),
});

export const membershipExpirySchema = z.object({
  /** ISO timestamp, or null to clear (permanent membership). */
  expiresAt: z.string().datetime().nullable(),
});

export const createServiceAccountSchema = z.object({
  name: z.string().min(1).max(120),
  publicKey: b64,
  envelope: boxEnvelope,
  keyGeneration: z.number().int().positive(),
  membershipTtlDays: z.number().int().min(1).max(365).optional(),
});

export const activateInvitationSchema = z.object({ envelope: boxEnvelope });

const chunkB64 = z.string().max(8_000_000); // ~6 MB decoded per chunk
export const createFileSchema = z.object({
  fileId: z.string().uuid(),
  nameEnv: recEnvelope,
  streamEnv: streamEnvelope,
  keyGeneration: z.number().int().positive(),
  chunks: z.array(chunkB64).max(500),
});

export const replaceFileSchema = z.object({
  streamEnv: streamEnvelope,
  keyGeneration: z.number().int().positive(),
  chunks: z.array(chunkB64).max(500),
});

export const rotationSchema = z.object({
  baseGeneration: z.number().int().positive(),
  removedUserId: z.string().uuid(),
  newVaultNameEnv: recEnvelope,
  newEnvelopes: z.array(z.object({ userId: z.string().uuid(), envelope: boxEnvelope })).max(100),
  newRevisions: z
    .array(
      z.object({
        environmentId: z.string().uuid(),
        baseRevision: z.number().int().min(0),
        snapshotEnv: recEnvelope,
        diffEnv: recEnvelope,
        nameEnv: recEnvelope,
      })
    )
    .max(100),
  fileRewrites: z
    .array(
      z.object({
        fileId: z.string().uuid(),
        streamEnv: streamEnvelope,
        chunks: z.array(chunkB64).max(500),
      })
    )
    .max(200),
});

export const exportAuditSchema = z.object({
  environmentId: z.string().uuid(),
  format: z.enum(["env", "json"]),
});
