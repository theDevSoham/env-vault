import { describe, expect, it } from "vitest";
import { CryptoError, DecryptionFailedError } from "../errors";
import { createFileDecryptStream, createFileEncryptStream } from "../files";
import { generateVaultKey } from "../keys";
import { randomBytes } from "../sodium";

const LOC = { vaultId: "vault-1", generation: 1 };

async function encryptAll(
  key: Uint8Array,
  chunks: Uint8Array[]
): Promise<{ envelope: unknown; ct: Uint8Array[] }> {
  const enc = await createFileEncryptStream(key, LOC, 64);
  const ct: Uint8Array[] = [];
  for (let i = 0; i < chunks.length; i++) {
    ct.push(await enc.push(chunks[i], i === chunks.length - 1));
  }
  return { envelope: enc.envelope, ct };
}

describe("file streams (secretstream)", () => {
  it("round-trips a multi-chunk file", async () => {
    const key = await generateVaultKey();
    const chunks = [await randomBytes(64), await randomBytes(64), await randomBytes(30)];
    const { envelope, ct } = await encryptAll(key, chunks);

    const dec = await createFileDecryptStream(key, envelope);
    const out: Uint8Array[] = [];
    for (const c of ct) out.push((await dec.pull(c)).data);
    expect(out).toEqual(chunks);
    expect(dec.finished()).toBe(true);
  });

  it("detects a tampered chunk", async () => {
    const key = await generateVaultKey();
    const { envelope, ct } = await encryptAll(key, [await randomBytes(64), await randomBytes(64)]);
    ct[0][5] ^= 0xff;
    const dec = await createFileDecryptStream(key, envelope);
    await expect(dec.pull(ct[0])).rejects.toThrow(DecryptionFailedError);
  });

  it("detects reordered chunks (ratchet)", async () => {
    const key = await generateVaultKey();
    const { envelope, ct } = await encryptAll(key, [
      await randomBytes(64),
      await randomBytes(64),
      await randomBytes(64),
    ]);
    const dec = await createFileDecryptStream(key, envelope);
    await expect(dec.pull(ct[1])).rejects.toThrow(DecryptionFailedError);
  });

  it("truncation is detectable: stream not finished without the FINAL chunk", async () => {
    const key = await generateVaultKey();
    const { envelope, ct } = await encryptAll(key, [await randomBytes(64), await randomBytes(64)]);
    const dec = await createFileDecryptStream(key, envelope);
    const first = await dec.pull(ct[0]);
    expect(first.final).toBe(false);
    // attacker drops the last chunk: consumer sees finished() === false and must reject the file
    expect(dec.finished()).toBe(false);

    const complete = await dec.pull(ct[1]);
    expect(complete.final).toBe(true);
    expect(dec.finished()).toBe(true);
  });

  it("rejects the wrong key at first pull", async () => {
    const key = await generateVaultKey();
    const { envelope, ct } = await encryptAll(key, [await randomBytes(64)]);
    const dec = await createFileDecryptStream(await generateVaultKey(), envelope);
    await expect(dec.pull(ct[0])).rejects.toThrow(DecryptionFailedError);
  });

  it("refuses to push after FINAL", async () => {
    const key = await generateVaultKey();
    const enc = await createFileEncryptStream(key, LOC, 64);
    await enc.push(await randomBytes(10), true);
    await expect(enc.push(await randomBytes(10), false)).rejects.toThrow(CryptoError);
  });
});
