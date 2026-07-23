import { assertRecordEnvelope, type RecordEnvelope } from "./envelope";
import { AadMismatchError, DecryptionFailedError, InvalidKeyError } from "./errors";
import { fromB64, randomBytes, toB64, utf8Encode } from "./sodium";

/**
 * Symmetric record encryption: AES-256-GCM via WebCrypto (ADR-001).
 *
 * Nonces are 12 CSPRNG bytes generated inside this module per encryption —
 * callers cannot supply them (crypto-spec §4). Random-nonce collision bound
 * (~2^32 per key) is documented in crypto-spec §4 and far above any per-key
 * operation count in this system.
 */

const GCM_NONCE_BYTES = 12;
const KEY_BYTES = 32;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new InvalidKeyError("WebCrypto SubtleCrypto is not available in this environment");
  return s;
}

async function importGcmKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== KEY_BYTES) {
    throw new InvalidKeyError("AES-256-GCM key must be 32 bytes");
  }
  return subtle().importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt bytes into an `enc.rec` envelope bound to `aad` (crypto-spec §2.1). */
export async function encryptRecord(
  plaintext: Uint8Array,
  key: Uint8Array,
  kid: string,
  aad: string
): Promise<RecordEnvelope> {
  const cryptoKey = await importGcmKey(key);
  const nonce = await randomBytes(GCM_NONCE_BYTES);
  const aadBytes = utf8Encode(aad);
  const ct = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, additionalData: aadBytes as BufferSource },
      cryptoKey,
      plaintext as BufferSource
    )
  );
  return {
    v: 1,
    t: "enc.rec",
    alg: "A256GCM",
    kid,
    n: await toB64(nonce),
    aad: await toB64(aadBytes),
    ct: await toB64(ct),
  };
}

/**
 * Decrypt an `enc.rec` envelope, verifying it is bound to `expectedAad`.
 * A mismatch between the envelope's recorded AAD and the caller's expectation
 * throws AadMismatchError before any decryption is attempted.
 */
export async function decryptRecord(
  envelope: unknown,
  key: Uint8Array,
  expectedAad: string
): Promise<Uint8Array> {
  const env = assertRecordEnvelope(envelope);
  const expectedAadB64 = await toB64(utf8Encode(expectedAad));
  if (env.aad !== expectedAadB64) {
    throw new AadMismatchError("envelope AAD does not match expected binding");
  }
  const cryptoKey = await importGcmKey(key);
  const nonce = await fromB64(env.n);
  const ct = await fromB64(env.ct);
  const aadBytes = utf8Encode(expectedAad);
  try {
    return new Uint8Array(
      await subtle().decrypt(
        { name: "AES-GCM", iv: nonce as BufferSource, additionalData: aadBytes as BufferSource },
        cryptoKey,
        ct as BufferSource
      )
    );
  } catch {
    throw new DecryptionFailedError("record decryption failed");
  }
}
