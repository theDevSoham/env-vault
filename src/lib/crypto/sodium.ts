import sodium from "libsodium-wrappers-sumo";

/**
 * Awaits libsodium's wasm initialization and returns the module.
 * Every public crypto function calls this; callers never touch libsodium directly.
 */
export async function getSodium(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}

/** Base64url (no padding) — the encoding used by every envelope field (crypto-spec §2). */
export async function toB64(bytes: Uint8Array): Promise<string> {
  const s = await getSodium();
  return s.to_base64(bytes, s.base64_variants.URLSAFE_NO_PADDING);
}

export async function fromB64(text: string): Promise<Uint8Array> {
  const s = await getSodium();
  return s.from_base64(text, s.base64_variants.URLSAFE_NO_PADDING);
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** CSPRNG bytes (handoff §34.10). The only source of randomness in this module. */
export async function randomBytes(length: number): Promise<Uint8Array> {
  const s = await getSodium();
  return s.randombytes_buf(length);
}
