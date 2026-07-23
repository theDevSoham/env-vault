import type { RecordEnvelope } from "./envelope";
import { decryptRecord, encryptRecord } from "./record";
import { utf8Decode, utf8Encode } from "./sodium";

/**
 * Encrypted display names (ADR-004, crypto-spec §7): vault names, environment
 * names, and secret filenames are ciphertext to the server. Callers build the
 * AAD with the aad.ts helpers (aadVaultName / aadEnvName / aadFileName) and
 * the kid with vaultKid().
 */

export async function encryptName(
  name: string,
  vaultKey: Uint8Array,
  kid: string,
  aad: string
): Promise<RecordEnvelope> {
  return encryptRecord(utf8Encode(name), vaultKey, kid, aad);
}

export async function decryptName(
  envelope: unknown,
  vaultKey: Uint8Array,
  aad: string
): Promise<string> {
  return utf8Decode(await decryptRecord(envelope, vaultKey, aad));
}
