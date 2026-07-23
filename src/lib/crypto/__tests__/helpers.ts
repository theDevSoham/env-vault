import type { KdfParams } from "../kdf";
import { randomBytes, toB64 } from "../sodium";

/**
 * Deliberately weak Argon2id parameters (libsodium minimums-adjacent) so the
 * suite stays fast. Production policy (ADR-003) is exercised once in
 * kdf.test.ts. NEVER copy these values into application code.
 */
export async function weakKdfParams(): Promise<KdfParams> {
  return {
    v: 1,
    alg: "argon2id13",
    salt: await toB64(await randomBytes(16)),
    ops: 1,
    mem: 8 * 1024 * 1024,
    outLen: 32,
  };
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
