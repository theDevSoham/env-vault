import { InvalidKeyError, UnsupportedEnvelopeError } from "./errors";
import { fromB64, getSodium, randomBytes, toB64 } from "./sodium";

/**
 * Password key derivation (crypto-spec §2.4/§3, ADR-003) and master-key
 * splitting with domain separation (handoff §23).
 */

/** Versioned per-user KDF parameter record — stored plaintext server-side. */
export interface KdfParams {
  v: 1;
  alg: "argon2id13";
  /** base64url 16-byte salt, unique per user, regenerated on password change. */
  salt: string;
  ops: number;
  /** Memory limit in bytes. */
  mem: number;
  outLen: 32;
}

/** Policy v1 (ADR-003): 64 MiB, ops 3. The single source of current policy. */
export const KDF_POLICY_V1 = {
  ops: 3,
  mem: 64 * 1024 * 1024,
} as const;

const SALT_BYTES = 16;
const MASTER_KEY_BYTES = 32;
const SUBKEY_BYTES = 32;

// crypto_kdf contexts must be exactly 8 characters (libsodium requirement).
const CTX_KEK = "envkek00";
const CTX_AUTH = "envauth0";

/** Fresh KDF params at current policy with a new random salt. */
export async function generateKdfParams(): Promise<KdfParams> {
  const salt = await randomBytes(SALT_BYTES);
  return {
    v: 1,
    alg: "argon2id13",
    salt: await toB64(salt),
    ops: KDF_POLICY_V1.ops,
    mem: KDF_POLICY_V1.mem,
    outLen: 32,
  };
}

/** Argon2id: password + stored params → 32-byte master key. Never persisted. */
export async function deriveMaster(password: string, params: KdfParams): Promise<Uint8Array> {
  if (params.v !== 1 || params.alg !== "argon2id13") {
    throw new UnsupportedEnvelopeError("unsupported KDF parameter record");
  }
  if (params.outLen !== MASTER_KEY_BYTES) {
    throw new UnsupportedEnvelopeError("unsupported KDF output length");
  }
  const s = await getSodium();
  const salt = await fromB64(params.salt);
  if (salt.length !== SALT_BYTES) {
    throw new InvalidKeyError("KDF salt must be 16 bytes");
  }
  return s.crypto_pwhash(
    MASTER_KEY_BYTES,
    password,
    salt,
    params.ops,
    params.mem,
    s.crypto_pwhash_ALG_ARGON2ID13
  );
}

/**
 * Domain-separated split of the master key (crypto-spec §3):
 * - kek: encrypts the user's private key (never leaves the client)
 * - authKey: sent to the server as the login credential (reveals nothing about kek)
 */
export async function splitMaster(
  masterKey: Uint8Array
): Promise<{ kek: Uint8Array; authKey: Uint8Array }> {
  if (masterKey.length !== MASTER_KEY_BYTES) {
    throw new InvalidKeyError("master key must be 32 bytes");
  }
  const s = await getSodium();
  const kek = s.crypto_kdf_derive_from_key(SUBKEY_BYTES, 1, CTX_KEK, masterKey);
  const authKey = s.crypto_kdf_derive_from_key(SUBKEY_BYTES, 1, CTX_AUTH, masterKey);
  return { kek, authKey };
}
