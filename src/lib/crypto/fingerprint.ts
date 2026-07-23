import { fromB64, getSodium } from "./sodium";

/**
 * Public-key fingerprint for out-of-band verification (threat-model T9/L2,
 * sharing-protocol §3, cli-key-provisioning §2). Shown wherever a public key
 * is about to be trusted: inviting a member, approving a CLI device.
 */
export async function publicKeyFingerprint(publicKeyB64: string): Promise<string> {
  const s = await getSodium();
  const digest = s.crypto_generichash(8, await fromB64(publicKeyB64), null);
  const hex = s.to_hex(digest).toUpperCase();
  return hex.match(/.{4}/g)!.join("-"); // e.g. "3F9A-11C2-8B07-D4E6"
}
