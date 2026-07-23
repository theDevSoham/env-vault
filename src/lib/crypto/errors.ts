/**
 * Typed errors for the crypto module (crypto-spec §9).
 *
 * Rule: error messages must never contain plaintext, key material, or
 * user-controlled content — they are safe to log by construction.
 */

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Envelope is structurally malformed (missing/mistyped fields). */
export class InvalidEnvelopeError extends CryptoError {}

/** Envelope is well-formed but its version/type/algorithm is not supported.
 *  Unknown versions are a hard error — never a silent fallback (crypto-spec §2). */
export class UnsupportedEnvelopeError extends CryptoError {}

/** AEAD open failed: wrong key, tampered ciphertext, or tampered AAD. */
export class DecryptionFailedError extends CryptoError {}

/** Caller-expected AAD does not match the AAD recorded in the envelope
 *  (likely a transplanted ciphertext — threat-model T1/T3). */
export class AadMismatchError extends CryptoError {}

/** A key has the wrong length/shape for the requested operation. */
export class InvalidKeyError extends CryptoError {}

/** Decrypted payload failed structural validation (not valid snapshot/diff JSON). */
export class InvalidPlaintextError extends CryptoError {}
