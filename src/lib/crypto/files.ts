import { vaultKid } from "./aad";
import { assertStreamEnvelope, type StreamEnvelope } from "./envelope";
import { CryptoError, DecryptionFailedError, InvalidKeyError } from "./errors";
import { fromB64, getSodium, toB64 } from "./sodium";

/**
 * Chunked file encryption via XChaCha20-Poly1305 secretstream (crypto-spec §8,
 * ADR-001). One fresh stream per file version; the FINAL tag makes truncation
 * detectable; chunk order/dropping is protected by the stream ratchet.
 */

export const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MiB plaintext chunks

export interface FileEncryptStream {
  /** DB-side stream envelope (header + chunking metadata). */
  envelope: StreamEnvelope;
  /** Encrypt the next plaintext chunk. Exactly the last call must set final=true. */
  push(chunk: Uint8Array, final: boolean): Promise<Uint8Array>;
}

export interface FileDecryptStream {
  /** Decrypt the next ciphertext chunk. `final` is true on the stream's last chunk. */
  pull(chunk: Uint8Array): Promise<{ data: Uint8Array; final: boolean }>;
  /** True once the FINAL chunk has been pulled — if the data ends without this, it was truncated. */
  finished(): boolean;
}

export async function createFileEncryptStream(
  vaultKey: Uint8Array,
  loc: { vaultId: string; generation: number },
  chunkBytes: number = DEFAULT_CHUNK_BYTES
): Promise<FileEncryptStream> {
  const s = await getSodium();
  if (vaultKey.length !== s.crypto_secretstream_xchacha20poly1305_KEYBYTES) {
    throw new InvalidKeyError("file stream key must be 32 bytes");
  }
  const { state, header } = s.crypto_secretstream_xchacha20poly1305_init_push(vaultKey);
  let done = false;
  const envelope: StreamEnvelope = {
    v: 1,
    t: "enc.stream",
    alg: "XCHACHA20-POLY1305-SECRETSTREAM",
    kid: vaultKid(loc.vaultId, loc.generation),
    hdr: await toB64(header),
    chunk: chunkBytes,
  };
  return {
    envelope,
    async push(chunk: Uint8Array, final: boolean): Promise<Uint8Array> {
      if (done) throw new CryptoError("stream already finalized");
      const tag = final
        ? s.crypto_secretstream_xchacha20poly1305_TAG_FINAL
        : s.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
      if (final) done = true;
      return s.crypto_secretstream_xchacha20poly1305_push(state, chunk, null, tag);
    },
  };
}

export async function createFileDecryptStream(
  vaultKey: Uint8Array,
  envelope: unknown
): Promise<FileDecryptStream> {
  const env = assertStreamEnvelope(envelope);
  const s = await getSodium();
  if (vaultKey.length !== s.crypto_secretstream_xchacha20poly1305_KEYBYTES) {
    throw new InvalidKeyError("file stream key must be 32 bytes");
  }
  const header = await fromB64(env.hdr);
  if (header.length !== s.crypto_secretstream_xchacha20poly1305_HEADERBYTES) {
    throw new DecryptionFailedError("stream header has unexpected length");
  }
  let state: ReturnType<typeof s.crypto_secretstream_xchacha20poly1305_init_pull>;
  try {
    state = s.crypto_secretstream_xchacha20poly1305_init_pull(header, vaultKey);
  } catch {
    throw new DecryptionFailedError("stream header rejected");
  }
  let done = false;
  return {
    async pull(chunk: Uint8Array): Promise<{ data: Uint8Array; final: boolean }> {
      if (done) throw new CryptoError("stream already finalized");
      let result: { message: Uint8Array; tag: number } | boolean;
      try {
        result = s.crypto_secretstream_xchacha20poly1305_pull(state, chunk, null);
      } catch {
        throw new DecryptionFailedError("file chunk decryption failed");
      }
      if (!result || typeof result === "boolean") {
        throw new DecryptionFailedError("file chunk decryption failed");
      }
      const final = result.tag === s.crypto_secretstream_xchacha20poly1305_TAG_FINAL;
      if (final) done = true;
      return { data: result.message, final };
    },
    finished(): boolean {
      return done;
    },
  };
}
