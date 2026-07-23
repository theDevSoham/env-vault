import { describe, expect, it } from "vitest";
import { AadMismatchError, DecryptionFailedError, InvalidKeyError } from "../errors";
import { deriveMaster, splitMaster } from "../kdf";
import {
  decryptPrivateKey,
  encryptPrivateKey,
  generateUserKeypair,
  generateVaultKey,
  unwrapVaultKey,
  wrapVaultKey,
} from "../keys";
import { decryptRecord, encryptRecord } from "../record";
import { randomBytes } from "../sodium";
import { utf8, weakKdfParams } from "./helpers";

describe("AEAD records (AES-256-GCM)", () => {
  it("round-trips with matching key + AAD", async () => {
    const key = await randomBytes(32);
    const env = await encryptRecord(utf8("hello aead"), key, "k:1", "aad:x");
    const out = await decryptRecord(env, key, "aad:x");
    expect(new TextDecoder().decode(out)).toBe("hello aead");
  });

  it("detects ciphertext tampering", async () => {
    const key = await randomBytes(32);
    const env = await encryptRecord(utf8("tamper me"), key, "k:1", "aad:x");
    // flip one character of the base64url ciphertext
    const flipped = env.ct[0] === "A" ? "B" : "A";
    const bad = { ...env, ct: flipped + env.ct.slice(1) };
    await expect(decryptRecord(bad, key, "aad:x")).rejects.toThrow(DecryptionFailedError);
  });

  it("detects nonce tampering", async () => {
    const key = await randomBytes(32);
    const env = await encryptRecord(utf8("nonce"), key, "k:1", "aad:x");
    const flipped = env.n[0] === "A" ? "B" : "A";
    await expect(
      decryptRecord({ ...env, n: flipped + env.n.slice(1) }, key, "aad:x")
    ).rejects.toThrow(DecryptionFailedError);
  });

  it("rejects the wrong key", async () => {
    const env = await encryptRecord(utf8("secret"), await randomBytes(32), "k:1", "aad:x");
    await expect(decryptRecord(env, await randomBytes(32), "aad:x")).rejects.toThrow(
      DecryptionFailedError
    );
  });

  it("rejects an AAD mismatch before decrypting (anti-transplant)", async () => {
    const key = await randomBytes(32);
    const env = await encryptRecord(utf8("bound"), key, "k:1", "snap:v1:e1:5");
    await expect(decryptRecord(env, key, "snap:v1:e2:5")).rejects.toThrow(AadMismatchError);
    await expect(decryptRecord(env, key, "snap:v1:e1:6")).rejects.toThrow(AadMismatchError);
  });

  it("rejects a lying aad field (envelope says one thing, ciphertext another)", async () => {
    const key = await randomBytes(32);
    const envA = await encryptRecord(utf8("a"), key, "k:1", "ctx:A");
    const envB = await encryptRecord(utf8("b"), key, "k:1", "ctx:B");
    // graft B's aad label onto A's ciphertext: passes the label check for ctx:B,
    // but GCM must reject because A was bound to ctx:A
    const franken = { ...envA, aad: envB.aad };
    await expect(decryptRecord(franken, key, "ctx:B")).rejects.toThrow(DecryptionFailedError);
  });

  it("rejects wrong-length keys", async () => {
    await expect(encryptRecord(utf8("x"), new Uint8Array(31), "k", "a")).rejects.toThrow(
      InvalidKeyError
    );
  });
});

describe("user identity", () => {
  it("private key round-trips through KEK encryption", async () => {
    const master = await deriveMaster("hunter2!", await weakKdfParams());
    const { kek } = await splitMaster(master);
    const kp = await generateUserKeypair();
    const env = await encryptPrivateKey(kp.privateKey, kek, "user-1");
    expect(env.kid).toBe("kek:user-1");
    const restored = await decryptPrivateKey(env, kek, "user-1");
    expect(restored).toEqual(kp.privateKey);
  });

  it("wrong password cannot decrypt the private key", async () => {
    const params = await weakKdfParams();
    const { kek } = await splitMaster(await deriveMaster("right-password", params));
    const kp = await generateUserKeypair();
    const env = await encryptPrivateKey(kp.privateKey, kek, "user-1");

    const { kek: wrongKek } = await splitMaster(await deriveMaster("wrong-password", params));
    await expect(decryptPrivateKey(env, wrongKek, "user-1")).rejects.toThrow(
      DecryptionFailedError
    );
  });

  it("a private key encrypted for one user id cannot be replayed under another", async () => {
    const { kek } = await splitMaster(await deriveMaster("pw", await weakKdfParams()));
    const kp = await generateUserKeypair();
    const env = await encryptPrivateKey(kp.privateKey, kek, "user-1");
    await expect(decryptPrivateKey(env, kek, "user-2")).rejects.toThrow(AadMismatchError);
  });
});

describe("vault keys", () => {
  it("generates 32-byte keys that differ", async () => {
    const a = await generateVaultKey();
    const b = await generateVaultKey();
    expect(a.length).toBe(32);
    expect(a).not.toEqual(b);
  });

  it("wrap/unwrap round-trips for the intended recipient", async () => {
    const vaultKey = await generateVaultKey();
    const alice = await generateUserKeypair();
    const env = await wrapVaultKey(vaultKey, alice.publicKey);
    expect(await unwrapVaultKey(env, alice)).toEqual(vaultKey);
  });

  it("cannot be unwrapped by a different keypair", async () => {
    const vaultKey = await generateVaultKey();
    const alice = await generateUserKeypair();
    const mallory = await generateUserKeypair();
    const env = await wrapVaultKey(vaultKey, alice.publicKey);
    await expect(unwrapVaultKey(env, mallory)).rejects.toThrow(DecryptionFailedError);
  });

  it("detects sealed-box tampering", async () => {
    const vaultKey = await generateVaultKey();
    const alice = await generateUserKeypair();
    const env = await wrapVaultKey(vaultKey, alice.publicKey);
    const flipped = env.ct[10] === "A" ? "B" : "A";
    const bad = { ...env, ct: env.ct.slice(0, 10) + flipped + env.ct.slice(11) };
    await expect(unwrapVaultKey(bad, alice)).rejects.toThrow(DecryptionFailedError);
  });
});
