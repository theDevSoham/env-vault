import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as signupPOST } from "../../../../app/api/auth/signup/route";
import { POST as vaultsPOST } from "../../../../app/api/vaults/route";
import { POST as envPOST } from "../../../../app/api/vaults/[vaultId]/environments/route";
import {
  GET as revisionsGET,
  POST as revisionsPOST,
} from "../../../../app/api/vaults/[vaultId]/environments/[envId]/revisions/route";
import { GET as revisionGET } from "../../../../app/api/vaults/[vaultId]/environments/[envId]/revisions/[number]/route";
import {
  aadEnvName,
  aadVaultName,
  decryptDiff,
  decryptSnapshot,
  diffSnapshots,
  emptySnapshot,
  encryptDiff,
  encryptName,
  encryptSnapshot,
  encryptPrivateKey,
  generateKdfParams,
  generateUserKeypair,
  generateVaultKey,
  newKeyId,
  vaultKid,
  wrapVaultKey,
  type Snapshot,
  type SnapshotKey,
} from "../../crypto";
import { toB64 } from "../../crypto/sodium";
import { closeDb, getDb } from "../../db";
import { users as usersTable } from "../../db/schema";

/**
 * Phase F integration tests (plannings/06 F4/F5): REAL crypto through the API.
 * Simulates two clients interleaving commits — verifies conflict → rebase →
 * linear gap-free history; atomic multi-op changesets; restore semantics;
 * exact rename detection via stable key ids.
 */

const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function req(method: string, url: string, opts: { body?: unknown; cookie?: string } = {}): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

let cookie: string;
let userId: string;
let vaultId: string;
let envId: string;
let vaultKey: Uint8Array;

/** Client-side commit helper mirroring flows.commitSnapshot. Returns the API response. */
async function commit(base: { revision: number; snapshot: Snapshot }, after: Snapshot, message?: string, restoredFromRevision?: number) {
  const location = { vaultId, envId, revision: base.revision + 1, generation: 1 };
  return revisionsPOST(
    req("POST", `/api/vaults/${vaultId}/environments/${envId}/revisions`, {
      cookie,
      body: {
        baseRevision: base.revision,
        keyGeneration: 1,
        message,
        restoredFromRevision,
        snapshotEnv: await encryptSnapshot(after, vaultKey, location),
        diffEnv: await encryptDiff(diffSnapshots(base.snapshot, after), vaultKey, location),
      },
    }),
    ctx({ vaultId, envId })
  );
}

async function fetchSnapshot(revision: number): Promise<Snapshot> {
  if (revision === 0) return emptySnapshot();
  const response = await revisionGET(
    req("GET", `/api/vaults/${vaultId}/environments/${envId}/revisions/${revision}`, { cookie }),
    ctx({ vaultId, envId, number: String(revision) })
  );
  expect(response.status).toBe(200);
  const { revision: dto } = (await response.json()) as { revision: { snapshotEnv: unknown; keyGeneration: number } };
  return decryptSnapshot(dto.snapshotEnv, vaultKey, { vaultId, envId, revision, generation: dto.keyGeneration });
}

beforeAll(async () => {
  // Real client-side signup material
  const kdfParams = await generateKdfParams();
  const keypair = await generateUserKeypair();
  const email = `vc-${run}@test.envvault.local`;
  const encPrivKeyEnv = await encryptPrivateKey(keypair.privateKey, crypto.getRandomValues(new Uint8Array(32)), email);
  const signup = await signupPOST(
    req("POST", "/api/auth/signup", {
      body: { email, authKey: await toB64(crypto.getRandomValues(new Uint8Array(32))), kdfParams, publicKey: await toB64(keypair.publicKey), encPrivKeyEnv },
    }),
    undefined
  );
  expect(signup.status).toBe(201);
  userId = ((await signup.json()) as { userId: string }).userId;
  cookie = signup.headers.get("set-cookie")!.split(";")[0];

  // Real vault: client-generated id, real vault key, encrypted name, wrapped envelope
  vaultId = crypto.randomUUID();
  vaultKey = await generateVaultKey();
  const vault = await vaultsPOST(
    req("POST", "/api/vaults", {
      cookie,
      body: {
        vaultId,
        nameEnv: await encryptName("VC Test Vault", vaultKey, vaultKid(vaultId, 1), aadVaultName(vaultId)),
        ownerEnvelope: await wrapVaultKey(vaultKey, keypair.publicKey),
      },
    }),
    undefined
  );
  expect(vault.status).toBe(201);

  envId = crypto.randomUUID();
  const environment = await envPOST(
    req("POST", `/api/vaults/${vaultId}/environments`, {
      cookie,
      body: { environmentId: envId, nameEnv: await encryptName("Development", vaultKey, vaultKid(vaultId, 1), aadEnvName(vaultId, envId)) },
    }),
    ctx({ vaultId })
  );
  expect(environment.status).toBe(201);
}, 120_000);

afterAll(async () => {
  try {
    if (userId) await getDb().delete(usersTable).where(eq(usersTable.id, userId));
  } finally {
    await closeDb();
  }
});

describe("version control (Phase F)", () => {
  let keyA: SnapshotKey;
  let keyB: SnapshotKey;

  it("F5: one multi-op changeset (add+add) produces exactly one revision", async () => {
    keyA = { id: await newKeyId(), name: "DATABASE_URL", value: "postgres://initial" };
    keyB = { id: await newKeyId(), name: "JWT_SECRET", value: "s3cret" };
    const after: Snapshot = { v: 1, keys: [keyA, keyB] };
    const response = await commit({ revision: 0, snapshot: emptySnapshot() }, after, "Initial");
    expect(response.status).toBe(201);
    expect(((await response.json()) as { number: number }).number).toBe(1);
  });

  it("F4: two clients interleave — conflict, rebase, linear gap-free history", async () => {
    const base = await fetchSnapshot(1);

    // Client 1 commits first (adds API_KEY)
    const client1After: Snapshot = { v: 1, keys: [...base.keys, { id: await newKeyId(), name: "API_KEY", value: "k1" }] };
    expect((await commit({ revision: 1, snapshot: base }, client1After)).status).toBe(201);

    // Client 2, still on revision 1, tries to delete JWT_SECRET → 409 with head
    const client2After: Snapshot = { v: 1, keys: base.keys.filter((k) => k.id !== keyB.id) };
    const conflict = await commit({ revision: 1, snapshot: base }, client2After);
    expect(conflict.status).toBe(409);
    const conflictBody = (await conflict.json()) as { currentHead: number };
    expect(conflictBody.currentHead).toBe(2);

    // Client 2 rebases: fetch head, re-apply its op, commit on new base
    const newBase = await fetchSnapshot(2);
    expect(newBase.keys.map((k) => k.name)).toContain("API_KEY"); // client 1's change present
    const rebased: Snapshot = { v: 1, keys: newBase.keys.filter((k) => k.id !== keyB.id) };
    const retry = await commit({ revision: 2, snapshot: newBase }, rebased);
    expect(retry.status).toBe(201);
    expect(((await retry.json()) as { number: number }).number).toBe(3);

    // Linear, gap-free sequence
    const list = await revisionsGET(
      req("GET", `/api/vaults/${vaultId}/environments/${envId}/revisions`, { cookie }),
      ctx({ vaultId, envId })
    );
    const { revisions } = (await list.json()) as { revisions: { number: number; diffEnv: unknown }[] };
    expect(revisions.map((r) => r.number)).toEqual([3, 2, 1]);

    // Decrypted diff of the rebased commit shows exactly the delete
    const diff3 = await decryptDiff(revisions[0].diffEnv, vaultKey, { vaultId, envId, revision: 3, generation: 1 });
    expect(diff3).toMatchObject({ added: [], modified: [], renamed: [], removed: ["JWT_SECRET"] });
  });

  it("F2: rename via stable id is detected exactly (no heuristics)", async () => {
    const base = await fetchSnapshot(3);
    const renamed: Snapshot = {
      v: 1,
      keys: base.keys.map((k) => (k.id === keyA.id ? { ...k, name: "DB_URL", value: "postgres://changed" } : k)),
    };
    const response = await commit({ revision: 3, snapshot: base }, renamed, "Rename + modify");
    expect(response.status).toBe(201);

    const list = await revisionsGET(
      req("GET", `/api/vaults/${vaultId}/environments/${envId}/revisions`, { cookie }),
      ctx({ vaultId, envId })
    );
    const { revisions } = (await list.json()) as { revisions: { number: number; diffEnv: unknown }[] };
    const diff4 = await decryptDiff(revisions[0].diffEnv, vaultKey, { vaultId, envId, revision: 4, generation: 1 });
    expect(diff4.renamed).toEqual([{ from: "DATABASE_URL", to: "DB_URL" }]);
    expect(diff4.modified).toEqual(["DB_URL"]); // rename + value change both reported
  });

  it("F3: restore creates a new revision equal to the old state; history intact", async () => {
    // Restore revision 1 (DATABASE_URL + JWT_SECRET) on top of head 4
    const target = await fetchSnapshot(1);
    const head = await fetchSnapshot(4);
    const response = await commit({ revision: 4, snapshot: head }, target, "Restored state from Revision 1", 1);
    expect(response.status).toBe(201);
    expect(((await response.json()) as { number: number }).number).toBe(5);

    // Restored snapshot content equals revision 1 exactly
    const restored = await fetchSnapshot(5);
    expect(restored).toEqual(target);

    // History preserved: all five revisions listed, nothing deleted (handoff §28)
    const list = await revisionsGET(
      req("GET", `/api/vaults/${vaultId}/environments/${envId}/revisions`, { cookie }),
      ctx({ vaultId, envId })
    );
    const { revisions } = (await list.json()) as { revisions: { number: number }[] };
    expect(revisions.map((r) => r.number)).toEqual([5, 4, 3, 2, 1]);
  });
});
