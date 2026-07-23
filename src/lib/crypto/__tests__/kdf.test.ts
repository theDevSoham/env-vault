import { describe, expect, it } from "vitest";
import { InvalidKeyError, UnsupportedEnvelopeError } from "../errors";
import { KDF_POLICY_V1, deriveMaster, generateKdfParams, splitMaster } from "../kdf";
import { weakKdfParams } from "./helpers";

describe("password KDF (Argon2id)", () => {
  it("is deterministic for the same password + params", async () => {
    const params = await weakKdfParams();
    const a = await deriveMaster("correct horse battery staple", params);
    const b = await deriveMaster("correct horse battery staple", params);
    expect(a).toEqual(b);
    expect(a.length).toBe(32);
  });

  it("differs for different passwords and different salts", async () => {
    const params = await weakKdfParams();
    const a = await deriveMaster("password-one", params);
    const b = await deriveMaster("password-two", params);
    expect(a).not.toEqual(b);

    const otherSalt = await weakKdfParams();
    const c = await deriveMaster("password-one", otherSalt);
    expect(a).not.toEqual(c);
  });

  it("generateKdfParams applies policy v1 with a fresh 16-byte salt", async () => {
    const p1 = await generateKdfParams();
    const p2 = await generateKdfParams();
    expect(p1.ops).toBe(KDF_POLICY_V1.ops);
    expect(p1.mem).toBe(KDF_POLICY_V1.mem);
    expect(p1.salt).not.toBe(p2.salt);
  });

  it("derives under real policy-v1 parameters (64 MiB / ops 3)", async () => {
    const params = await generateKdfParams();
    const key = await deriveMaster("policy-check", params);
    expect(key.length).toBe(32);
  });

  it("rejects unsupported parameter records", async () => {
    const params = await weakKdfParams();
    await expect(deriveMaster("x", { ...params, alg: "sha256" as never })).rejects.toThrow(
      UnsupportedEnvelopeError
    );
    await expect(deriveMaster("x", { ...params, v: 2 as never })).rejects.toThrow(
      UnsupportedEnvelopeError
    );
  });
});

describe("master key splitting (domain separation)", () => {
  it("kek and authKey are distinct from each other and the master", async () => {
    const master = await deriveMaster("split-me", await weakKdfParams());
    const { kek, authKey } = await splitMaster(master);
    expect(kek.length).toBe(32);
    expect(authKey.length).toBe(32);
    expect(kek).not.toEqual(authKey);
    expect(kek).not.toEqual(master);
    expect(authKey).not.toEqual(master);
  });

  it("is deterministic", async () => {
    const master = await deriveMaster("split-me", await weakKdfParams());
    const first = await splitMaster(master);
    const second = await splitMaster(master);
    expect(first.kek).toEqual(second.kek);
    expect(first.authKey).toEqual(second.authKey);
  });

  it("rejects wrong-length master keys", async () => {
    await expect(splitMaster(new Uint8Array(16))).rejects.toThrow(InvalidKeyError);
  });
});
