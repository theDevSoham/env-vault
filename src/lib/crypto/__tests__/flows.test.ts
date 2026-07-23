import { describe, expect, it } from "vitest";
import { DecryptionFailedError } from "../errors";
import { deriveMaster, generateKdfParams, splitMaster, type KdfParams } from "../kdf";
import {
  decryptPrivateKey,
  encryptPrivateKey,
  generateUserKeypair,
  generateVaultKey,
  unwrapVaultKey,
  wrapVaultKey,
  type UserKeypair,
} from "../keys";
import {
  decryptSnapshot,
  diffSnapshots,
  encryptSnapshot,
  newKeyId,
  type Snapshot,
} from "../snapshot";
import { weakKdfParams } from "./helpers";

/**
 * End-to-end protocol flows from handoff §35 Phase B, composed purely from the
 * crypto module — no DB, no network. Simulates what web clients will do.
 */

interface SimUser {
  id: string;
  password: string;
  kdfParams: KdfParams;
  keypair: UserKeypair;
  /** What the "server" would store. */
  stored: { publicKey: Uint8Array; encPrivKey: unknown };
}

async function signup(id: string, password: string): Promise<SimUser> {
  const kdfParams = await weakKdfParams();
  const { kek } = await splitMaster(await deriveMaster(password, kdfParams));
  const keypair = await generateUserKeypair();
  const encPrivKey = await encryptPrivateKey(keypair.privateKey, kek, id);
  return { id, password, kdfParams, keypair, stored: { publicKey: keypair.publicKey, encPrivKey } };
}

/** Login from stored material only (fresh device: nothing but password + server data). */
async function login(user: SimUser): Promise<UserKeypair> {
  const { kek } = await splitMaster(await deriveMaster(user.password, user.kdfParams));
  const privateKey = await decryptPrivateKey(user.stored.encPrivKey, kek, user.id);
  return { publicKey: user.stored.publicKey, privateKey };
}

describe("protocol flows", () => {
  it("signup → login round-trip recovers the same identity", async () => {
    const soham = await signup("soham", "pw-soham-123");
    const restored = await login(soham);
    expect(restored.privateKey).toEqual(soham.keypair.privateKey);
  });

  it("vault creation + sharing: invitee decrypts what the owner encrypted", async () => {
    const soham = await signup("soham", "pw-soham");
    const alice = await signup("alice", "pw-alice");

    // Soham creates a vault (gen 1) and commits revision 1
    const vaultKey = await generateVaultKey();
    const ownerEnvelope = await wrapVaultKey(vaultKey, soham.stored.publicKey);
    const snap: Snapshot = {
      v: 1,
      keys: [{ id: await newKeyId(), name: "API_KEY", value: "shared-secret-value" }],
    };
    const loc = { vaultId: "v1", envId: "dev", revision: 1, generation: 1 };
    const snapEnv = await encryptSnapshot(snap, vaultKey, loc);

    // Soham invites Alice: unwraps with his key, wraps for hers (sharing-protocol Flow A)
    const sohamKeys = await login(soham);
    const vk = await unwrapVaultKey(ownerEnvelope, sohamKeys);
    const aliceEnvelope = await wrapVaultKey(vk, alice.stored.publicKey);

    // Alice, from her own credentials alone, reads the snapshot
    const aliceKeys = await login(alice);
    const aliceVaultKey = await unwrapVaultKey(aliceEnvelope, aliceKeys);
    const decrypted = await decryptSnapshot(snapEnv, aliceVaultKey, loc);
    expect(decrypted).toEqual(snap);
  });

  it("revocation: removed member is locked out of post-rotation state; remaining members keep full history", async () => {
    const owner = await signup("owner", "pw-owner");
    const alice = await signup("alice", "pw-alice");
    const bob = await signup("bob", "pw-bob");

    // Generation 1: everyone is a member, revision 1 exists
    const vk1 = await generateVaultKey();
    const envs1 = {
      owner: await wrapVaultKey(vk1, owner.stored.publicKey),
      alice: await wrapVaultKey(vk1, alice.stored.publicKey),
      bob: await wrapVaultKey(vk1, bob.stored.publicKey),
    };
    const rev1Loc = { vaultId: "v1", envId: "prod", revision: 1, generation: 1 };
    const rev1: Snapshot = {
      v: 1,
      keys: [{ id: await newKeyId(), name: "DB_URL", value: "gen1-value" }],
    };
    const rev1Env = await encryptSnapshot(rev1, vk1, rev1Loc);

    // Bob (before removal) legitimately obtains vk1 — assume he keeps it forever
    const bobRetainedKey = await unwrapVaultKey(envs1.bob, await login(bob));

    // Owner removes Bob: rotation to generation 2 (revocation-protocol §3)
    const ownerKeys = await login(owner);
    const currentVk = await unwrapVaultKey(envs1.owner, ownerKeys);
    const currentState = await decryptSnapshot(rev1Env, currentVk, rev1Loc);
    const vk2 = await generateVaultKey();
    const rev2Loc = { vaultId: "v1", envId: "prod", revision: 2, generation: 2 };
    const rev2Env = await encryptSnapshot(currentState, vk2, rev2Loc);
    const envs2 = {
      owner: await wrapVaultKey(vk2, owner.stored.publicKey),
      alice: await wrapVaultKey(vk2, alice.stored.publicKey),
      // no envelope for bob (handoff §20.5)
    };

    // Post-rotation revision 3 with new content
    const rev3Loc = { vaultId: "v1", envId: "prod", revision: 3, generation: 2 };
    const rev3: Snapshot = {
      v: 1,
      keys: [{ id: await newKeyId(), name: "DB_URL", value: "gen2-rotated-value" }],
    };
    const rev3Env = await encryptSnapshot(rev3, vk2, rev3Loc);

    // Bob's retained gen-1 key cannot decrypt gen-2 payloads
    await expect(decryptSnapshot(rev2Env, bobRetainedKey, rev2Loc)).rejects.toThrow(
      DecryptionFailedError
    );
    await expect(decryptSnapshot(rev3Env, bobRetainedKey, rev3Loc)).rejects.toThrow(
      DecryptionFailedError
    );
    // And Bob has no gen-2 envelope to unwrap — his old envelope yields only vk1
    expect(bobRetainedKey).toEqual(vk1);

    // Alice reads both old (gen 1) and new (gen 2) state — history preserved (handoff §21)
    const aliceKeys = await login(alice);
    const aliceVk1 = await unwrapVaultKey(envs1.alice, aliceKeys);
    const aliceVk2 = await unwrapVaultKey(envs2.alice, aliceKeys);
    expect(await decryptSnapshot(rev1Env, aliceVk1, rev1Loc)).toEqual(rev1);
    expect(await decryptSnapshot(rev3Env, aliceVk2, rev3Loc)).toEqual(rev3);

    // Bob's retained key still opens pre-rotation history he already had — expected (N3)
    expect(await decryptSnapshot(rev1Env, bobRetainedKey, rev1Loc)).toEqual(rev1);
  });

  it("revision restoration: old state re-encrypted at the current generation as a new revision", async () => {
    const vk1 = await generateVaultKey();
    const vk2 = await generateVaultKey(); // after some rotation

    const idA = await newKeyId();
    const rev1: Snapshot = { v: 1, keys: [{ id: idA, name: "KEY_A", value: "original" }] };
    const rev1Loc = { vaultId: "v1", envId: "dev", revision: 1, generation: 1 };
    const rev1Env = await encryptSnapshot(rev1, vk1, rev1Loc);

    const rev2: Snapshot = { v: 1, keys: [{ id: idA, name: "KEY_A", value: "changed" }] };

    // Restore revision 1 while head is 2 and generation is now 2 (revision-model §3)
    const restored = await decryptSnapshot(rev1Env, vk1, rev1Loc);
    const rev3Loc = { vaultId: "v1", envId: "dev", revision: 3, generation: 2 };
    const rev3Env = await encryptSnapshot(restored, vk2, rev3Loc);

    const rev3 = await decryptSnapshot(rev3Env, vk2, rev3Loc);
    expect(rev3).toEqual(rev1);

    // The restore commit's diff vs. head shows the value change, names only
    const diff = diffSnapshots(rev2, rev3);
    expect(diff.modified).toEqual(["KEY_A"]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("KDF upgrade / password change: new params + re-encrypted private key, identity unchanged", async () => {
    const user = await signup("carol", "old-password");
    const keypairBefore = await login(user);

    // password change flow (account-key-lifecycle §3) with upgraded params
    const newParams = await generateKdfParams(); // real policy v1
    const { kek: newKek } = await splitMaster(await deriveMaster("new-password", newParams));
    user.stored.encPrivKey = await encryptPrivateKey(keypairBefore.privateKey, newKek, user.id);
    user.kdfParams = newParams;
    user.password = "new-password";

    const keypairAfter = await login(user);
    expect(keypairAfter.privateKey).toEqual(keypairBefore.privateKey);
  });
});
