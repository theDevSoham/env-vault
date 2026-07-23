import { describe, expect, it } from "vitest";
import {
  assertBoxEnvelope,
  assertRecordEnvelope,
  assertStreamEnvelope,
} from "../envelope";
import { InvalidEnvelopeError, UnsupportedEnvelopeError } from "../errors";
import { encryptRecord } from "../record";
import { randomBytes } from "../sodium";
import { utf8 } from "./helpers";

describe("envelope validation", () => {
  it("accepts a real record envelope", async () => {
    const key = await randomBytes(32);
    const env = await encryptRecord(utf8("data"), key, "kid", "aad");
    expect(assertRecordEnvelope(env)).toBe(env);
  });

  it("rejects non-objects", () => {
    for (const bad of [null, undefined, "x", 42, []]) {
      expect(() => assertRecordEnvelope(bad)).toThrow(InvalidEnvelopeError);
    }
  });

  it("hard-errors on unknown version — no silent fallback", async () => {
    const key = await randomBytes(32);
    const env = await encryptRecord(utf8("data"), key, "kid", "aad");
    expect(() => assertRecordEnvelope({ ...env, v: 2 })).toThrow(UnsupportedEnvelopeError);
    expect(() => assertRecordEnvelope({ ...env, v: 0 })).toThrow(UnsupportedEnvelopeError);
  });

  it("hard-errors on unknown algorithm or type", async () => {
    const key = await randomBytes(32);
    const env = await encryptRecord(utf8("data"), key, "kid", "aad");
    expect(() => assertRecordEnvelope({ ...env, alg: "A128GCM" })).toThrow(UnsupportedEnvelopeError);
    expect(() => assertRecordEnvelope({ ...env, t: "enc.box" })).toThrow(UnsupportedEnvelopeError);
  });

  it("rejects missing fields", async () => {
    const key = await randomBytes(32);
    const env = await encryptRecord(utf8("data"), key, "kid", "aad");
    for (const field of ["kid", "n", "ct", "aad"] as const) {
      const broken: Record<string, unknown> = { ...env };
      delete broken[field];
      expect(() => assertRecordEnvelope(broken)).toThrow(InvalidEnvelopeError);
    }
  });

  it("validates box and stream envelopes", () => {
    expect(() =>
      assertBoxEnvelope({ v: 1, t: "enc.box", alg: "X25519-SEALED", rcp: "a", ct: "b" })
    ).not.toThrow();
    expect(() =>
      assertBoxEnvelope({ v: 1, t: "enc.box", alg: "RSA-OAEP", rcp: "a", ct: "b" })
    ).toThrow(UnsupportedEnvelopeError);
    expect(() =>
      assertStreamEnvelope({
        v: 1,
        t: "enc.stream",
        alg: "XCHACHA20-POLY1305-SECRETSTREAM",
        kid: "v:1",
        hdr: "h",
        chunk: 4194304,
      })
    ).not.toThrow();
    expect(() =>
      assertStreamEnvelope({
        v: 1,
        t: "enc.stream",
        alg: "XCHACHA20-POLY1305-SECRETSTREAM",
        kid: "v:1",
        hdr: "h",
        chunk: 0,
      })
    ).toThrow(InvalidEnvelopeError);
  });
});
