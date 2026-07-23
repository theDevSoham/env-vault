/**
 * Env Vault crypto module — the single owner of cryptographic primitives
 * (handoff §15, crypto-spec §1/§9).
 *
 * Rules for consumers:
 * - Import ONLY from this index; never from libsodium or crypto.subtle directly.
 * - No plaintext secret or key material may be persisted, logged, or sent to
 *   the server. Everything returned here is either an envelope (safe to store)
 *   or in-memory-only key/plaintext material.
 * - AAD strings and kids come from the exported aad helpers — never hand-built.
 */

export {
  CryptoError,
  InvalidEnvelopeError,
  UnsupportedEnvelopeError,
  DecryptionFailedError,
  AadMismatchError,
  InvalidKeyError,
  InvalidPlaintextError,
} from "./errors";

export type { RecordEnvelope, BoxEnvelope, StreamEnvelope } from "./envelope";
export { assertRecordEnvelope, assertBoxEnvelope, assertStreamEnvelope } from "./envelope";

export {
  aadSnapshot,
  aadDiff,
  aadVaultName,
  aadEnvName,
  aadFileName,
  aadPrivateKey,
  vaultKid,
  kekKid,
} from "./aad";

export type { KdfParams } from "./kdf";
export { KDF_POLICY_V1, generateKdfParams, deriveMaster, splitMaster } from "./kdf";

export type { UserKeypair } from "./keys";
export {
  generateUserKeypair,
  encryptPrivateKey,
  decryptPrivateKey,
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
} from "./keys";

export { encryptRecord, decryptRecord } from "./record";

export type { Snapshot, SnapshotKey, StructuralDiff, SnapshotLocation } from "./snapshot";
export {
  newKeyId,
  emptySnapshot,
  encryptSnapshot,
  decryptSnapshot,
  diffSnapshots,
  encryptDiff,
  decryptDiff,
} from "./snapshot";

export { encryptName, decryptName } from "./names";

export type { FileEncryptStream, FileDecryptStream } from "./files";
export { DEFAULT_CHUNK_BYTES, createFileEncryptStream, createFileDecryptStream } from "./files";
