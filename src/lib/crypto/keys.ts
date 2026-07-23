import { aadPrivateKey, kekKid } from "./aad";
import { assertBoxEnvelope, type BoxEnvelope, type RecordEnvelope } from "./envelope";
import { DecryptionFailedError, InvalidKeyError } from "./errors";
import { decryptRecord, encryptRecord } from "./record";
import { fromB64, getSodium, randomBytes, toB64 } from "./sodium";

/**
 * User cryptographic identity and vault keys (crypto-spec §3).
 */

export interface UserKeypair {
  /** X25519 public key — stored plaintext server-side. */
  publicKey: Uint8Array;
  /** X25519 private key — exists only in client memory or KEK-encrypted at rest. */
  privateKey: Uint8Array;
}

const VAULT_KEY_BYTES = 32;

/** Generate a fresh X25519 keypair (signup, device provisioning). */
export async function generateUserKeypair(): Promise<UserKeypair> {
  const s = await getSodium();
  const kp = s.crypto_box_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/** Encrypt the private key under the KEK for server-side storage (enc.rec, kid "kek:<userId>"). */
export async function encryptPrivateKey(
  privateKey: Uint8Array,
  kek: Uint8Array,
  userId: string
): Promise<RecordEnvelope> {
  return encryptRecord(privateKey, kek, kekKid(userId), aadPrivateKey(userId));
}

/** Decrypt the stored private key with the KEK. Wrong password ⇒ DecryptionFailedError. */
export async function decryptPrivateKey(
  envelope: unknown,
  kek: Uint8Array,
  userId: string
): Promise<Uint8Array> {
  return decryptRecord(envelope, kek, aadPrivateKey(userId));
}

/** Fresh random 256-bit vault key (handoff §16). */
export async function generateVaultKey(): Promise<Uint8Array> {
  return randomBytes(VAULT_KEY_BYTES);
}

/**
 * Wrap a vault key for a recipient's public key as an X25519 sealed box
 * (enc.box). Used for vault creation, sharing, rotation re-wraps, and CLI
 * device provisioning (payload-agnostic by design — cli-key-provisioning §5).
 */
export async function wrapVaultKey(
  vaultKey: Uint8Array,
  recipientPublicKey: Uint8Array
): Promise<BoxEnvelope> {
  const s = await getSodium();
  const ct = s.crypto_box_seal(vaultKey, recipientPublicKey);
  return {
    v: 1,
    t: "enc.box",
    alg: "X25519-SEALED",
    rcp: await toB64(recipientPublicKey),
    ct: await toB64(ct),
  };
}

/** Unwrap a vault-key envelope with the member's keypair. */
export async function unwrapVaultKey(envelope: unknown, keypair: UserKeypair): Promise<Uint8Array> {
  const env = assertBoxEnvelope(envelope);
  const s = await getSodium();
  const expectedRcp = await toB64(keypair.publicKey);
  if (env.rcp !== expectedRcp) {
    throw new DecryptionFailedError("envelope is not addressed to this keypair");
  }
  const ct = await fromB64(env.ct);
  let plaintext: Uint8Array;
  try {
    plaintext = s.crypto_box_seal_open(ct, keypair.publicKey, keypair.privateKey);
  } catch {
    throw new DecryptionFailedError("vault key unwrap failed");
  }
  if (plaintext.length !== VAULT_KEY_BYTES) {
    throw new InvalidKeyError("unwrapped vault key has unexpected length");
  }
  return plaintext;
}
