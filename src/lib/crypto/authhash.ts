import { InvalidKeyError } from "./errors";
import { getSodium, randomBytes, toB64 } from "./sodium";

/**
 * SERVER-SIDE auth-credential handling (ADR-002, account-key-lifecycle §1).
 * Lives in the crypto module because it is the sole owner of primitives —
 * server code imports these helpers, never libsodium.
 *
 * The client's authKey is a domain-separated Argon2id derivative of the
 * password (256-bit entropy). The server still treats it with full password
 * discipline: stretched with Argon2id (crypto_pwhash_str) before storage, so
 * a database dump contains no login-usable credential.
 */

/** Hash a client-supplied authKey (base64url) for storage as auth_verifier. */
export async function hashAuthKey(authKeyB64: string): Promise<string> {
  const s = await getSodium();
  return s.crypto_pwhash_str(
    authKeyB64,
    s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    s.crypto_pwhash_MEMLIMIT_INTERACTIVE
  );
}

/** Constant-time verify of a client authKey against the stored verifier. */
export async function verifyAuthKey(authKeyB64: string, verifier: string): Promise<boolean> {
  const s = await getSodium();
  return s.crypto_pwhash_str_verify(verifier, authKeyB64);
}

/** Random 32-byte session token, base64url. High-entropy — not a password. */
export async function generateSessionToken(): Promise<string> {
  return toB64(await randomBytes(32));
}

/** Unkeyed BLAKE2b-256 of a session token for DB storage (lookup by hash). */
export async function hashSessionToken(token: string): Promise<string> {
  const s = await getSodium();
  return s.to_hex(s.crypto_generichash(32, token, null));
}

/**
 * Deterministic keyed hash (BLAKE2b) — used server-side to fabricate stable
 * dummy KDF salts for unknown emails (threat-model T10 anti-enumeration).
 */
export async function keyedHash32(input: string, key: Uint8Array): Promise<Uint8Array> {
  if (key.length < 16) throw new InvalidKeyError("keyed hash key too short");
  const s = await getSodium();
  return s.crypto_generichash(32, input, key);
}
