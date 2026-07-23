import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateVaultKey, generateUserKeypair, wrapVaultKey } from "../keys";
import { encryptRecord } from "../record";
import { encryptSnapshot, newKeyId, type Snapshot } from "../snapshot";
import { utf8 } from "./helpers";

describe("nonce uniqueness (handoff §34.9)", () => {
  it("2000 encryptions under one key produce 2000 distinct nonces", async () => {
    const key = await generateVaultKey();
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const env = await encryptRecord(utf8("x"), key, "k", "a");
      seen.add(env.n);
    }
    expect(seen.size).toBe(2000);
  });

  it("identical plaintext+key+AAD still yields distinct ciphertexts", async () => {
    const key = await generateVaultKey();
    const a = await encryptRecord(utf8("same input"), key, "k", "a");
    const b = await encryptRecord(utf8("same input"), key, "k", "a");
    expect(a.n).not.toBe(b.n);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe("no plaintext in serialized output (plan B4)", () => {
  const MARKER_NAME = "SUPER_SECRET_MARKER_NAME_7f3a";
  const MARKER_VALUE = "super-secret-marker-value-9c1e";

  it("snapshot envelopes leak neither names nor values", async () => {
    const vaultKey = await generateVaultKey();
    const snap: Snapshot = {
      v: 1,
      keys: [{ id: await newKeyId(), name: MARKER_NAME, value: MARKER_VALUE }],
    };
    const env = await encryptSnapshot(snap, vaultKey, {
      vaultId: "v",
      envId: "e",
      revision: 1,
      generation: 1,
    });
    const serialized = JSON.stringify(env);
    expect(serialized).not.toContain(MARKER_NAME);
    expect(serialized).not.toContain(MARKER_VALUE);
  });

  it("vault-key wrap envelopes leak no key bytes", async () => {
    const vaultKey = await generateVaultKey();
    const kp = await generateUserKeypair();
    const env = await wrapVaultKey(vaultKey, kp.publicKey);
    const serialized = JSON.stringify(env);
    // the raw vault key must not appear in any encoding of the envelope
    expect(serialized).not.toContain(Buffer.from(vaultKey).toString("base64url"));
    expect(serialized).not.toContain(Buffer.from(vaultKey).toString("hex"));
  });
});

describe("module isolation (plan exit criteria)", () => {
  it("crypto sources import only libsodium and sibling files", () => {
    const dir = join(__dirname, "..");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(5);
    const importRe = /(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf-8");
      for (const match of source.matchAll(importRe)) {
        const spec = match[1];
        const allowed = spec.startsWith("./") || spec === "libsodium-wrappers-sumo";
        expect(allowed, `${file} imports forbidden module "${spec}"`).toBe(true);
      }
    }
  });

  it("crypto sources contain no console/logging calls", () => {
    const dir = join(__dirname, "..");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const source = readFileSync(join(dir, file), "utf-8");
      expect(source.includes("console."), `${file} contains console logging`).toBe(false);
    }
  });
});
