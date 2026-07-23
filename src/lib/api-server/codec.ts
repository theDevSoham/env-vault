import { badRequest } from "./errors";

/** Server-side base64url <-> bytes for opaque ciphertext chunks. Node Buffer —
 *  no crypto involved, just transport encoding. */

export function b64urlToBytes(text: string): Uint8Array {
  try {
    return new Uint8Array(Buffer.from(text, "base64url"));
  } catch {
    throw badRequest("invalid_base64");
  }
}

export function bytesToB64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
