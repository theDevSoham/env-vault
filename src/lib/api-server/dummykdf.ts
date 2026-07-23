import { KDF_POLICY_V1, keyedHash32 } from "../crypto";

/**
 * Anti-enumeration dummy KDF params (threat-model T10, lifecycle §2.1):
 * unknown emails receive deterministic, plausible params so the kdf endpoint
 * can't distinguish existing from non-existing accounts.
 */

let cachedSecret: Uint8Array | null = null;

function serverSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.SERVER_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = new TextEncoder().encode(fromEnv);
  } else {
    // Dev fallback: ephemeral random secret (dummy salts change across restarts).
    cachedSecret = crypto.getRandomValues(new Uint8Array(32));
  }
  return cachedSecret;
}

export async function dummyKdfParams(email: string): Promise<unknown> {
  const digest = await keyedHash32(`kdf-dummy:${email.toLowerCase()}`, serverSecret());
  const salt = Buffer.from(digest.slice(0, 16)).toString("base64url");
  return { v: 1, alg: "argon2id13", salt, ops: KDF_POLICY_V1.ops, mem: KDF_POLICY_V1.mem, outLen: 32 };
}
