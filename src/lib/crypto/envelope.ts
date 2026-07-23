import { InvalidEnvelopeError, UnsupportedEnvelopeError } from "./errors";

/**
 * Versioned ciphertext envelopes (crypto-spec §2, handoff §34.15).
 * Unknown `v`/`t`/`alg` is a hard error — never a silent fallback.
 */

/** Symmetric record envelope — AES-256-GCM (crypto-spec §2.1). */
export interface RecordEnvelope {
  v: 1;
  t: "enc.rec";
  alg: "A256GCM";
  /** Key identifier, e.g. "<vault-id>:<generation>" or "kek:<user-id>". */
  kid: string;
  /** base64url 12-byte nonce. */
  n: string;
  /** base64url of the AAD string actually bound into the ciphertext. */
  aad: string;
  /** base64url ciphertext (includes GCM tag). */
  ct: string;
}

/** Asymmetric wrap envelope — X25519 sealed box (crypto-spec §2.2). */
export interface BoxEnvelope {
  v: 1;
  t: "enc.box";
  alg: "X25519-SEALED";
  /** base64url recipient public key. */
  rcp: string;
  /** base64url sealed ciphertext. */
  ct: string;
}

/** Stream envelope for files — XChaCha20-Poly1305 secretstream (crypto-spec §2.3). */
export interface StreamEnvelope {
  v: 1;
  t: "enc.stream";
  alg: "XCHACHA20-POLY1305-SECRETSTREAM";
  kid: string;
  /** base64url secretstream header. */
  hdr: string;
  /** Plaintext chunk size in bytes. */
  chunk: number;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function requireString(env: Record<string, unknown>, field: string): string {
  const value = env[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidEnvelopeError(`envelope field "${field}" missing or not a string`);
  }
  return value;
}

function checkVersionAndType(env: Record<string, unknown>, expectedT: string, expectedAlg: string): void {
  if (env.v !== 1) {
    throw new UnsupportedEnvelopeError(`unsupported envelope version`);
  }
  if (env.t !== expectedT) {
    throw new UnsupportedEnvelopeError(`unexpected envelope type`);
  }
  if (env.alg !== expectedAlg) {
    throw new UnsupportedEnvelopeError(`unsupported algorithm for envelope type`);
  }
}

export function assertRecordEnvelope(x: unknown): RecordEnvelope {
  if (!isRecord(x)) throw new InvalidEnvelopeError("envelope is not an object");
  checkVersionAndType(x, "enc.rec", "A256GCM");
  requireString(x, "kid");
  requireString(x, "n");
  requireString(x, "ct");
  const aad = x.aad;
  if (typeof aad !== "string") {
    throw new InvalidEnvelopeError('envelope field "aad" missing or not a string');
  }
  return x as unknown as RecordEnvelope;
}

export function assertBoxEnvelope(x: unknown): BoxEnvelope {
  if (!isRecord(x)) throw new InvalidEnvelopeError("envelope is not an object");
  checkVersionAndType(x, "enc.box", "X25519-SEALED");
  requireString(x, "rcp");
  requireString(x, "ct");
  return x as unknown as BoxEnvelope;
}

export function assertStreamEnvelope(x: unknown): StreamEnvelope {
  if (!isRecord(x)) throw new InvalidEnvelopeError("envelope is not an object");
  checkVersionAndType(x, "enc.stream", "XCHACHA20-POLY1305-SECRETSTREAM");
  requireString(x, "kid");
  requireString(x, "hdr");
  if (typeof x.chunk !== "number" || !Number.isInteger(x.chunk) || x.chunk <= 0) {
    throw new InvalidEnvelopeError('envelope field "chunk" missing or not a positive integer');
  }
  return x as unknown as StreamEnvelope;
}
