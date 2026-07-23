import { describe, expect, it } from "vitest";
import { AadMismatchError, InvalidPlaintextError } from "../errors";
import { generateVaultKey } from "../keys";
import {
  decryptDiff,
  decryptSnapshot,
  diffSnapshots,
  encryptDiff,
  encryptSnapshot,
  newKeyId,
  type Snapshot,
} from "../snapshot";

const LOC = { vaultId: "vault-1", envId: "env-1", revision: 7, generation: 1 };

async function sampleSnapshot(): Promise<Snapshot> {
  return {
    v: 1,
    keys: [
      { id: await newKeyId(), name: "DATABASE_URL", value: "postgres://db.internal/prod" },
      { id: await newKeyId(), name: "JWT_SECRET", value: "s3cr3t-token-value" },
    ],
  };
}

describe("snapshot encryption", () => {
  it("round-trips", async () => {
    const vaultKey = await generateVaultKey();
    const snap = await sampleSnapshot();
    const env = await encryptSnapshot(snap, vaultKey, LOC);
    expect(env.kid).toBe("vault-1:1");
    const out = await decryptSnapshot(env, vaultKey, LOC);
    expect(out).toEqual(snap);
  });

  it("cannot be transplanted to another environment or revision (AAD binding)", async () => {
    const vaultKey = await generateVaultKey();
    const env = await encryptSnapshot(await sampleSnapshot(), vaultKey, LOC);
    await expect(
      decryptSnapshot(env, vaultKey, { ...LOC, envId: "env-2" })
    ).rejects.toThrow(AadMismatchError);
    await expect(
      decryptSnapshot(env, vaultKey, { ...LOC, revision: 8 })
    ).rejects.toThrow(AadMismatchError);
    await expect(
      decryptSnapshot(env, vaultKey, { ...LOC, vaultId: "vault-2" })
    ).rejects.toThrow(AadMismatchError);
  });

  it("rejects snapshots with duplicate ids or malformed entries", async () => {
    const vaultKey = await generateVaultKey();
    const id = await newKeyId();
    const dup: Snapshot = {
      v: 1,
      keys: [
        { id, name: "A", value: "1" },
        { id, name: "B", value: "2" },
      ],
    };
    await expect(encryptSnapshot(dup, vaultKey, LOC)).rejects.toThrow(InvalidPlaintextError);
  });
});

describe("structural diffs (by stable id)", () => {
  it("detects add / remove / rename / modify — including rename+modify", async () => {
    const idDb = await newKeyId();
    const idJwt = await newKeyId();
    const idLegacy = await newKeyId();
    const idBoth = await newKeyId();

    const before: Snapshot = {
      v: 1,
      keys: [
        { id: idDb, name: "DATABASE_URL", value: "old-db" },
        { id: idJwt, name: "JWT_SECRET", value: "same" },
        { id: idLegacy, name: "LEGACY_API_KEY", value: "x" },
        { id: idBoth, name: "OLD_NAME", value: "old-value" },
      ],
    };
    const after: Snapshot = {
      v: 1,
      keys: [
        { id: idDb, name: "DATABASE_URL", value: "new-db" }, // modified
        { id: idJwt, name: "AUTH_SECRET", value: "same" }, // renamed only
        { id: idBoth, name: "NEW_NAME", value: "new-value" }, // renamed + modified
        { id: await newKeyId(), name: "STRIPE_WEBHOOK_SECRET", value: "whsec" }, // added
      ],
    };

    const diff = diffSnapshots(before, after);
    expect(diff.added).toEqual(["STRIPE_WEBHOOK_SECRET"]);
    expect(diff.removed).toEqual(["LEGACY_API_KEY"]);
    expect(diff.renamed).toEqual([
      { from: "JWT_SECRET", to: "AUTH_SECRET" },
      { from: "OLD_NAME", to: "NEW_NAME" },
    ]);
    expect(diff.modified).toEqual(["DATABASE_URL", "NEW_NAME"]);
  });

  it("a rename is never misreported as remove+add (stable ids)", async () => {
    const id = await newKeyId();
    const before: Snapshot = { v: 1, keys: [{ id, name: "JWT_SECRET", value: "v" }] };
    const after: Snapshot = { v: 1, keys: [{ id, name: "AUTH_SECRET", value: "v" }] };
    const diff = diffSnapshots(before, after);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.renamed).toEqual([{ from: "JWT_SECRET", to: "AUTH_SECRET" }]);
    expect(diff.modified).toEqual([]);
  });

  it("empty diff for identical snapshots; output ordering is deterministic", async () => {
    const snap = await sampleSnapshot();
    const diff = diffSnapshots(snap, snap);
    expect(diff).toEqual({ v: 1, added: [], removed: [], renamed: [], modified: [] });
  });

  it("diff metadata encrypts and decrypts with revision binding", async () => {
    const vaultKey = await generateVaultKey();
    const before = await sampleSnapshot();
    const after: Snapshot = { v: 1, keys: [...before.keys] };
    after.keys[0] = { ...after.keys[0], value: "changed" };

    const diff = diffSnapshots(before, after);
    const env = await encryptDiff(diff, vaultKey, LOC);
    expect(await decryptDiff(env, vaultKey, LOC)).toEqual(diff);
    await expect(decryptDiff(env, vaultKey, { ...LOC, revision: 99 })).rejects.toThrow(
      AadMismatchError
    );
  });

  it("diff contains names only — never values", async () => {
    const before = await sampleSnapshot();
    const after: Snapshot = {
      v: 1,
      keys: before.keys.map((k) => ({ ...k, value: k.value + "-changed" })),
    };
    const serialized = JSON.stringify(diffSnapshots(before, after));
    expect(serialized).not.toContain("postgres://");
    expect(serialized).not.toContain("-changed");
    expect(serialized).not.toContain("s3cr3t");
  });
});
