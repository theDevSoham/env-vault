import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, type Db } from "../client";
import { appendAudit, listAuditEvents } from "../audit";
import { InvitationStateError, RevisionConflictError, RotationConflictError } from "../errors";
import { createEnvironment, deleteEnvironment } from "../environments";
import {
  createSecretFile,
  deleteSecretFile,
  getSecretFile,
  replaceSecretFile,
} from "../files";
import {
  acceptInvitation,
  attachEnvelopeAndActivate,
  createInvitation,
  listAwaitingWrap,
} from "../invitations";
import { commitRevision, getRevision, listRevisions } from "../revisions";
import { commitKeyRotation } from "../rotation";
import { auditEvents, revisions, users as usersTable, vaults as vaultsTable } from "../schema";
import { createUser, getPublicKey, getUserByEmail } from "../users";
import {
  createVault,
  deleteVault,
  getMembership,
  getVault,
  listKeyEnvelopesForMember,
  listVaultsForUser,
} from "../vaults";
import { PostgresBlobStore } from "../../storage";

/**
 * Integration tests against the real (dev) Postgres — DATABASE_URL from .env.
 * Creates its own randomized users/vault, deletes them at the end. Audit rows
 * are append-only by design and intentionally remain.
 */

const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const email = (name: string) => `it-${run}-${name}@test.envvault.local`;

// Fake envelope stand-ins — the DB layer treats envelopes as opaque jsonb;
// real envelope structure is validated by src/lib/crypto, tested separately.
const fakeRec = (label: string) => ({ v: 1, t: "enc.rec", alg: "A256GCM", kid: "k:1", n: "n", aad: "a", ct: `ct-${label}` });
const fakeBox = (label: string) => ({ v: 1, t: "enc.box", alg: "X25519-SEALED", rcp: "r", ct: `ct-${label}` });
const fakeStream = (label: string) => ({ v: 1, t: "enc.stream", alg: "XCHACHA20-POLY1305-SECRETSTREAM", kid: "k:1", hdr: `h-${label}`, chunk: 64 });

let db: Db;
let ownerId: string;
let aliceId: string;
let bobId: string;
let vaultId: string;
let envId: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing — set it in .env");
  db = getDb();
  ownerId = (await createUser(db, { email: email("owner"), authVerifier: "verifier-owner", publicKey: "pk-owner", encPrivKeyEnv: fakeRec("owner-priv"), kdfParams: { v: 1, alg: "argon2id13", salt: "s", ops: 3, mem: 1, outLen: 32 } })).id;
  aliceId = (await createUser(db, { email: email("alice"), authVerifier: "verifier-alice", publicKey: "pk-alice", encPrivKeyEnv: fakeRec("alice-priv"), kdfParams: { v: 1, alg: "argon2id13", salt: "s", ops: 3, mem: 1, outLen: 32 } })).id;
  bobId = (await createUser(db, { email: email("bob"), authVerifier: "verifier-bob", publicKey: "pk-bob", encPrivKeyEnv: fakeRec("bob-priv"), kdfParams: { v: 1, alg: "argon2id13", salt: "s", ops: 3, mem: 1, outLen: 32 } })).id;
});

afterAll(async () => {
  // Vault may already be deleted by the last test; users cascade their rows.
  try {
    for (const id of [ownerId, aliceId, bobId]) {
      if (id) await db.delete(usersTable).where(eq(usersTable.id, id));
    }
  } finally {
    await closeDb();
  }
});

describe("users", () => {
  it("email lookup is case-insensitive; public key retrievable", async () => {
    const found = await getUserByEmail(db, email("OWNER").toUpperCase());
    expect(found?.id).toBe(ownerId);
    expect(await getPublicKey(db, aliceId)).toBe("pk-alice");
  });

  it("duplicate email (case-insensitive) is rejected", async () => {
    await expect(
      createUser(db, { email: email("Owner"), authVerifier: "x", publicKey: "p", encPrivKeyEnv: fakeRec("d"), kdfParams: {} })
    ).rejects.toThrow();
  });
});

describe("vaults + memberships", () => {
  it("creates vault with owner membership + gen-1 envelope, atomically", async () => {
    vaultId = (await createVault(db, { id: crypto.randomUUID(), ownerUserId: ownerId, nameEnv: fakeRec("vname"), ownerEnvelope: fakeBox("vk-owner-g1") })).id;
    const vault = await getVault(db, vaultId);
    expect(vault.keyGeneration).toBe(1);
    const membership = await getMembership(db, vaultId, ownerId);
    expect(membership?.role).toBe("owner");
    expect(await getMembership(db, vaultId, aliceId)).toBeNull();
    const envelopes = await listKeyEnvelopesForMember(db, vaultId, ownerId);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].generation).toBe(1);
    expect((await listVaultsForUser(db, ownerId)).map((v) => v.vaultId)).toContain(vaultId);
  });
});

describe("revisions (optimistic concurrency)", () => {
  it("commits sequentially and rejects stale bases with the current head", async () => {
    envId = (await createEnvironment(db, { id: crypto.randomUUID(), vaultId, nameEnv: fakeRec("ename"), actorUserId: ownerId })).id;

    const r1 = await commitRevision(db, { vaultId, environmentId: envId, baseRevision: 0, actorUserId: ownerId, keyGeneration: 1, snapshotEnv: fakeRec("snap1"), diffEnv: fakeRec("diff1"), message: "Initial" });
    expect(r1.number).toBe(1);

    // stale base — like a second client that hasn't seen revision 1
    await expect(
      commitRevision(db, { vaultId, environmentId: envId, baseRevision: 0, actorUserId: aliceId, keyGeneration: 1, snapshotEnv: fakeRec("stale"), diffEnv: fakeRec("stale") })
    ).rejects.toThrow(RevisionConflictError);

    const r2 = await commitRevision(db, { vaultId, environmentId: envId, baseRevision: 1, actorUserId: ownerId, keyGeneration: 1, snapshotEnv: fakeRec("snap2"), diffEnv: fakeRec("diff2") });
    expect(r2.number).toBe(2);

    const list = await listRevisions(db, envId);
    expect(list.map((r) => r.number)).toEqual([2, 1]);
    expect((await getRevision(db, envId, 1)).message).toBe("Initial");
  });

  it("conflict error carries the current head for client rebase", async () => {
    try {
      await commitRevision(db, { vaultId, environmentId: envId, baseRevision: 0, actorUserId: ownerId, keyGeneration: 1, snapshotEnv: fakeRec("x"), diffEnv: fakeRec("x") });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RevisionConflictError);
      expect((e as RevisionConflictError).currentHead).toBe(2);
    }
  });
});

/** Asserts the promise rejects with an append-only trigger error anywhere in the cause chain. */
async function expectAppendOnlyRejection(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    expect.unreachable("expected append-only rejection");
  } catch (e) {
    let found = false;
    for (let err = e as Error | undefined; err; err = err.cause as Error | undefined) {
      if (/append-only/.test(err.message ?? "")) found = true;
    }
    expect(found, "error chain should mention append-only").toBe(true);
  }
}

describe("append-only enforcement (DB triggers)", () => {
  it("revisions reject direct UPDATE and direct DELETE", async () => {
    await expectAppendOnlyRejection(
      db.update(revisions).set({ message: "tampered" }).where(eq(revisions.environmentId, envId))
    );
    await expectAppendOnlyRejection(
      db.delete(revisions).where(eq(revisions.environmentId, envId))
    );
  });

  it("audit events reject UPDATE and DELETE", async () => {
    await appendAudit(db, { vaultId, actorUserId: ownerId, type: "export_requested", context: { format: "env" } });
    await expectAppendOnlyRejection(
      db.update(auditEvents).set({ type: "tampered" }).where(eq(auditEvents.vaultId, vaultId))
    );
    await expectAppendOnlyRejection(
      db.delete(auditEvents).where(eq(auditEvents.vaultId, vaultId))
    );
  });
});

describe("invitations", () => {
  it("Flow A (envelope at creation): accept activates membership at current generation", async () => {
    const inv = await createInvitation(db, { vaultId, inviteeEmail: email("alice"), role: "member", invitedByUserId: ownerId, envelope: fakeBox("vk-alice-g1") });
    const result = await acceptInvitation(db, inv.id, aliceId);
    expect(result.state).toBe("active");
    expect((await getMembership(db, vaultId, aliceId))?.role).toBe("member");
    const envs = await listKeyEnvelopesForMember(db, vaultId, aliceId);
    expect(envs).toHaveLength(1);
    expect(envs[0].generation).toBe(1);
  });

  it("Flow B (deferred wrap): accepted → awaiting wrap → owner activates", async () => {
    const inv = await createInvitation(db, { vaultId, inviteeEmail: email("bob"), role: "member", invitedByUserId: ownerId });
    const result = await acceptInvitation(db, inv.id, bobId);
    expect(result.state).toBe("accepted");
    expect(await getMembership(db, vaultId, bobId)).toBeNull(); // no access yet

    const awaiting = await listAwaitingWrap(db, vaultId);
    expect(awaiting.map((i) => i.id)).toContain(inv.id);

    await attachEnvelopeAndActivate(db, inv.id, { inviteeUserId: bobId, envelope: fakeBox("vk-bob-g1"), actorUserId: ownerId });
    expect((await getMembership(db, vaultId, bobId))?.status).toBe("active");
    // double-activation must fail
    await expect(
      attachEnvelopeAndActivate(db, inv.id, { inviteeUserId: bobId, envelope: fakeBox("dup"), actorUserId: ownerId })
    ).rejects.toThrow(InvitationStateError);
  });
});

describe("key rotation (atomic)", () => {
  it("rejects an envelope set that includes the removed member", async () => {
    await expect(
      commitKeyRotation(db, {
        vaultId, actorUserId: ownerId, baseGeneration: 1, removedUserId: bobId,
        newVaultNameEnv: fakeRec("vname-g2"),
        newEnvelopes: [
          { userId: ownerId, envelope: fakeBox("g2-owner") },
          { userId: aliceId, envelope: fakeBox("g2-alice") },
          { userId: bobId, envelope: fakeBox("g2-bob-ILLEGAL") },
        ],
        newRevisions: [{ environmentId: envId, baseRevision: 2, snapshotEnv: fakeRec("snap-g2"), diffEnv: fakeRec("diff-g2"), nameEnv: fakeRec("ename-g2") }],
        fileRewrites: [],
      })
    ).rejects.toThrow(RotationConflictError);
    // nothing applied
    expect((await getVault(db, vaultId)).keyGeneration).toBe(1);
    expect((await getMembership(db, vaultId, bobId))?.status).toBe("active");
  });

  it("removes bob, bumps generation, re-wraps remaining members, appends rotation revision", async () => {
    await commitKeyRotation(db, {
      vaultId, actorUserId: ownerId, baseGeneration: 1, removedUserId: bobId,
      newVaultNameEnv: fakeRec("vname-g2"),
      newEnvelopes: [
        { userId: ownerId, envelope: fakeBox("g2-owner") },
        { userId: aliceId, envelope: fakeBox("g2-alice") },
      ],
      newRevisions: [{ environmentId: envId, baseRevision: 2, snapshotEnv: fakeRec("snap-g2"), diffEnv: fakeRec("diff-g2"), nameEnv: fakeRec("ename-g2") }],
      fileRewrites: [],
    });

    expect((await getVault(db, vaultId)).keyGeneration).toBe(2);
    expect(await getMembership(db, vaultId, bobId)).toBeNull(); // removed
    expect((await listKeyEnvelopesForMember(db, vaultId, bobId)).map((e) => e.generation)).toEqual([1]); // no gen-2
    expect((await listKeyEnvelopesForMember(db, vaultId, ownerId)).map((e) => e.generation)).toEqual([1, 2]);
    const rev3 = await getRevision(db, envId, 3);
    expect(rev3.keyGeneration).toBe(2);
    expect(rev3.message).toBe("Vault key rotated");

    // stale generation now rejected (concurrent-rotation serialization)
    await expect(
      commitKeyRotation(db, {
        vaultId, actorUserId: ownerId, baseGeneration: 1, removedUserId: aliceId,
        newVaultNameEnv: fakeRec("x"),
        newEnvelopes: [{ userId: ownerId, envelope: fakeBox("x") }],
        newRevisions: [{ environmentId: envId, baseRevision: 3, snapshotEnv: fakeRec("x"), diffEnv: fakeRec("x"), nameEnv: fakeRec("x") }],
        fileRewrites: [],
      })
    ).rejects.toThrow(RotationConflictError);
  });
});

describe("secret files (Postgres blob store)", () => {
  it("stores, replaces and deletes encrypted chunks losslessly", async () => {
    const chunkA = new Uint8Array([1, 2, 3, 255, 0, 128]);
    const chunkB = new Uint8Array(300).fill(7);
    const file = await createSecretFile(db, { id: crypto.randomUUID(), vaultId, actorUserId: ownerId, nameEnv: fakeRec("fname"), streamEnv: fakeStream("f1"), keyGeneration: 2, chunks: [chunkA, chunkB] });

    const store = new PostgresBlobStore(db);
    expect(await store.chunkCount(file.id)).toBe(2);
    expect(await store.getChunk(file.id, 0)).toEqual(chunkA);
    expect(await store.getChunk(file.id, 1)).toEqual(chunkB);
    expect((await getSecretFile(db, vaultId, file.id)).sizeBytes).toBe(chunkA.length + chunkB.length);

    const chunkC = new Uint8Array([9, 9, 9]);
    await replaceSecretFile(db, file.id, { vaultId, actorUserId: ownerId, streamEnv: fakeStream("f2"), keyGeneration: 2, chunks: [chunkC] });
    expect(await store.chunkCount(file.id)).toBe(1);
    expect(await store.getChunk(file.id, 0)).toEqual(chunkC);

    await deleteSecretFile(db, file.id, { vaultId, actorUserId: ownerId });
    expect(await store.chunkCount(file.id)).toBe(0); // chunks cascade with the row
  });
});

describe("audit trail + teardown cascades", () => {
  it("audit log recorded the lifecycle without secret material", async () => {
    const events = await listAuditEvents(db, vaultId, 100);
    const types = events.map((e) => e.type);
    for (const expected of ["vault_created", "environment_created", "revision_created", "member_invited", "invitation_accepted", "member_removed", "vault_key_rotated", "secret_file_uploaded"]) {
      expect(types).toContain(expected);
    }
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("ct-"); // no envelope/ciphertext blobs in audit
  });

  it("environment deletion cascades revisions (sanctioned aggregate destruction)", async () => {
    await deleteEnvironment(db, envId, ownerId);
    const remaining = await db.select().from(revisions).where(eq(revisions.environmentId, envId));
    expect(remaining).toHaveLength(0);
  });

  it("vault deletion cascades everything; audit history survives", async () => {
    await deleteVault(db, vaultId, ownerId);
    expect(await db.select().from(vaultsTable).where(eq(vaultsTable.id, vaultId))).toHaveLength(0);
    const events = await listAuditEvents(db, vaultId, 10);
    expect(events.length).toBeGreaterThan(0); // log outlives the vault
    expect(events.map((e) => e.type)).toContain("vault_deleted");
  });

  it("DB stores no plaintext-shaped secret columns (schema self-check)", async () => {
    // Every *_env / envelope column is jsonb; this guards against accidental
    // text columns being added for secret material later.
    const rows = await db.execute(sql`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public'
        and (column_name like '%_env' or column_name = 'envelope')
    `);
    const cols = rows.rows as { table_name: string; column_name: string; data_type: string }[];
    expect(cols.length).toBeGreaterThanOrEqual(7);
    for (const col of cols) {
      expect(col.data_type, `${col.table_name}.${col.column_name}`).toBe("jsonb");
    }
  });
});
