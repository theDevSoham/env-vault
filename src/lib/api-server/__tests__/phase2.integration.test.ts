import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as signupPOST } from "../../../../app/api/auth/signup/route";
import { POST as vaultsPOST } from "../../../../app/api/vaults/route";
import { GET as vaultGET } from "../../../../app/api/vaults/[vaultId]/route";
import { POST as envPOST } from "../../../../app/api/vaults/[vaultId]/environments/route";
import { POST as revisionsPOST } from "../../../../app/api/vaults/[vaultId]/environments/[envId]/revisions/route";
import { GET as revisionGET } from "../../../../app/api/vaults/[vaultId]/environments/[envId]/revisions/[number]/route";
import { POST as invitePOST } from "../../../../app/api/vaults/[vaultId]/invitations/route";
import { POST as acceptPOST } from "../../../../app/api/invitations/[invitationId]/accept/route";
import { POST as expiryPOST } from "../../../../app/api/vaults/[vaultId]/members/[memberUserId]/expiry/route";
import {
  GET as saGET,
  POST as saPOST,
} from "../../../../app/api/vaults/[vaultId]/service-accounts/route";
import { POST as saRevokePOST } from "../../../../app/api/vaults/[vaultId]/service-accounts/[saUserId]/revoke/route";
import {
  aadEnvName,
  aadVaultName,
  decryptName,
  decryptSnapshot,
  diffSnapshots,
  emptySnapshot,
  encryptDiff,
  encryptName,
  encryptPrivateKey,
  encryptSnapshot,
  generateKdfParams,
  generateUserKeypair,
  generateVaultKey,
  newKeyId,
  unwrapVaultKey,
  vaultKid,
  wrapVaultKey,
  type Snapshot,
} from "../../crypto";
import { toB64 } from "../../crypto/sodium";
import { closeDb, getDb } from "../../db";
import { users as usersTable, vaultMemberships } from "../../db/schema";
import { resetRateLimits } from "../ratelimit";

/** Phase 2: service accounts (real-crypto pull chain) + expiring memberships. */

const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const email = (name: string) => `p2-${run}-${name}@test.envvault.local`;

function req(method: string, url: string, opts: { body?: unknown; cookie?: string; bearer?: string } = {}): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

let ownerCookie: string;
let ownerId: string;
let tempCookie: string;
let tempId: string;
let vaultId: string;
let envId: string;
let vaultKey: Uint8Array;

async function signup(label: string, keypair: Awaited<ReturnType<typeof generateUserKeypair>>) {
  const address = email(label);
  const response = await signupPOST(
    req("POST", "/api/auth/signup", {
      body: {
        email: address,
        authKey: await toB64(crypto.getRandomValues(new Uint8Array(32))),
        kdfParams: await generateKdfParams(),
        publicKey: await toB64(keypair.publicKey),
        encPrivKeyEnv: await encryptPrivateKey(keypair.privateKey, crypto.getRandomValues(new Uint8Array(32)), address),
      },
    }),
    undefined
  );
  expect(response.status).toBe(201);
  return {
    id: ((await response.json()) as { userId: string }).userId,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
}

beforeAll(async () => {
  resetRateLimits();
  const ownerKeys = await generateUserKeypair();
  ({ id: ownerId, cookie: ownerCookie } = await signup("owner", ownerKeys));
  const tempKeys = await generateUserKeypair();
  ({ id: tempId, cookie: tempCookie } = await signup("temp", tempKeys));

  vaultId = crypto.randomUUID();
  vaultKey = await generateVaultKey();
  const vault = await vaultsPOST(
    req("POST", "/api/vaults", {
      cookie: ownerCookie,
      body: {
        vaultId,
        nameEnv: await encryptName("P2 Vault", vaultKey, vaultKid(vaultId, 1), aadVaultName(vaultId)),
        ownerEnvelope: await wrapVaultKey(vaultKey, ownerKeys.publicKey),
      },
    }),
    undefined
  );
  expect(vault.status).toBe(201);

  envId = crypto.randomUUID();
  const environment = await envPOST(
    req("POST", `/api/vaults/${vaultId}/environments`, {
      cookie: ownerCookie,
      body: {
        environmentId: envId,
        nameEnv: await encryptName("Production", vaultKey, vaultKid(vaultId, 1), aadEnvName(vaultId, envId)),
      },
    }),
    ctx({ vaultId })
  );
  expect(environment.status).toBe(201);
}, 120_000);

afterAll(async () => {
  try {
    for (const id of [ownerId, tempId]) {
      if (id) await getDb().delete(usersTable).where(eq(usersTable.id, id));
    }
  } finally {
    await closeDb();
  }
});

describe("service accounts (P2-2)", () => {
  let saUserId: string;
  let saToken: string;
  const saKeypairPromise = generateUserKeypair();

  it("owner creates an SA; token returned once; stale generation rejected", async () => {
    const saKeypair = await saKeypairPromise;
    const stale = await saPOST(
      req("POST", `/api/vaults/${vaultId}/service-accounts`, {
        cookie: ownerCookie,
        body: { name: "ci-test", publicKey: await toB64(saKeypair.publicKey), envelope: await wrapVaultKey(vaultKey, saKeypair.publicKey), keyGeneration: 99 },
      }),
      ctx({ vaultId })
    );
    expect(stale.status).toBe(400);

    const created = await saPOST(
      req("POST", `/api/vaults/${vaultId}/service-accounts`, {
        cookie: ownerCookie,
        body: { name: "ci-test", publicKey: await toB64(saKeypair.publicKey), envelope: await wrapVaultKey(vaultKey, saKeypair.publicKey), keyGeneration: 1 },
      }),
      ctx({ vaultId })
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { serviceAccountId: string; token: string };
    saUserId = body.serviceAccountId;
    saToken = body.token;
    expect(saToken).toBeTruthy();

    const list = await saGET(req("GET", `/api/vaults/${vaultId}/service-accounts`, { cookie: ownerCookie }), ctx({ vaultId }));
    const { serviceAccounts } = (await list.json()) as { serviceAccounts: { userId: string; name: string }[] };
    expect(serviceAccounts.map((a) => a.userId)).toContain(saUserId);
  });

  it("SA bearer pulls and decrypts through its own keypair (CI chain)", async () => {
    // Owner commits a revision the SA should be able to read
    const key = { id: await newKeyId(), name: "CI_TOKEN", value: "ci-secret-value" };
    const snapshot: Snapshot = { v: 1, keys: [key] };
    const location = { vaultId, envId, revision: 1, generation: 1 };
    const commit = await revisionsPOST(
      req("POST", `/api/vaults/${vaultId}/environments/${envId}/revisions`, {
        cookie: ownerCookie,
        body: {
          baseRevision: 0,
          keyGeneration: 1,
          snapshotEnv: await encryptSnapshot(snapshot, vaultKey, location),
          diffEnv: await encryptDiff(diffSnapshots(emptySnapshot(), snapshot), vaultKey, location),
        },
      }),
      ctx({ vaultId, envId })
    );
    expect(commit.status).toBe(201);

    // SA side: bearer-auth vault detail → unwrap own envelope → decrypt snapshot
    const saKeypair = await saKeypairPromise;
    const detail = await vaultGET(req("GET", `/api/vaults/${vaultId}`, { bearer: saToken }), ctx({ vaultId }));
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as { vault: { nameEnv: unknown }; envelopes: { generation: number; envelope: unknown }[] };
    const saVaultKey = await unwrapVaultKey(detailBody.envelopes.find((e) => e.generation === 1)!.envelope, saKeypair);
    expect(await decryptName(detailBody.vault.nameEnv, saVaultKey, aadVaultName(vaultId))).toBe("P2 Vault");

    const revision = await revisionGET(
      req("GET", `/api/vaults/${vaultId}/environments/${envId}/revisions/1`, { bearer: saToken }),
      ctx({ vaultId, envId, number: "1" })
    );
    const { revision: dto } = (await revision.json()) as { revision: { snapshotEnv: unknown } };
    const decrypted = await decryptSnapshot(dto.snapshotEnv, saVaultKey, { vaultId, envId, revision: 1, generation: 1 });
    expect(decrypted.keys[0]).toMatchObject({ name: "CI_TOKEN", value: "ci-secret-value" });
  });

  it("revoke kills SA access immediately", async () => {
    const revoke = await saRevokePOST(
      req("POST", `/api/vaults/${vaultId}/service-accounts/${saUserId}/revoke`, { cookie: ownerCookie }),
      ctx({ vaultId, saUserId })
    );
    expect(revoke.status).toBe(200);
    const after = await vaultGET(req("GET", `/api/vaults/${vaultId}`, { bearer: saToken }), ctx({ vaultId }));
    expect(after.status).toBe(401);
  });
});

describe("expiring memberships (P2-1)", () => {
  it("invitation TTL applies to membership; expired membership behaves as non-membership", async () => {
    const tempKeys = await generateUserKeypair(); // envelope content irrelevant for authz test
    const invite = await invitePOST(
      req("POST", `/api/vaults/${vaultId}/invitations`, {
        cookie: ownerCookie,
        body: { inviteeEmail: email("temp"), role: "member", envelope: await wrapVaultKey(vaultKey, tempKeys.publicKey), membershipTtlDays: 30 },
      }),
      ctx({ vaultId })
    );
    expect(invite.status).toBe(201);
    const { invitationId } = (await invite.json()) as { invitationId: string };
    const accept = await acceptPOST(req("POST", `/api/invitations/${invitationId}/accept`, { cookie: tempCookie }), ctx({ invitationId }));
    expect(((await accept.json()) as { state: string }).state).toBe("active");

    // Access works while unexpired
    expect((await vaultGET(req("GET", `/api/vaults/${vaultId}`, { cookie: tempCookie }), ctx({ vaultId }))).status).toBe(200);

    // Force-expire directly in the DB (simulating time passing)
    await getDb()
      .update(vaultMemberships)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(vaultMemberships.userId, tempId));
    expect((await vaultGET(req("GET", `/api/vaults/${vaultId}`, { cookie: tempCookie }), ctx({ vaultId }))).status).toBe(404);
  });

  it("owner can extend/clear expiry; self-expiry and past dates rejected", async () => {
    const extend = await expiryPOST(
      req("POST", `/api/vaults/${vaultId}/members/${tempId}/expiry`, {
        cookie: ownerCookie,
        body: { expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() },
      }),
      ctx({ vaultId, memberUserId: tempId })
    );
    expect(extend.status).toBe(200);
    expect((await vaultGET(req("GET", `/api/vaults/${vaultId}`, { cookie: tempCookie }), ctx({ vaultId }))).status).toBe(200);

    const clear = await expiryPOST(
      req("POST", `/api/vaults/${vaultId}/members/${tempId}/expiry`, { cookie: ownerCookie, body: { expiresAt: null } }),
      ctx({ vaultId, memberUserId: tempId })
    );
    expect(clear.status).toBe(200);

    const self = await expiryPOST(
      req("POST", `/api/vaults/${vaultId}/members/${ownerId}/expiry`, { cookie: ownerCookie, body: { expiresAt: null } }),
      ctx({ vaultId, memberUserId: ownerId })
    );
    expect(self.status).toBe(400);

    const past = await expiryPOST(
      req("POST", `/api/vaults/${vaultId}/members/${tempId}/expiry`, {
        cookie: ownerCookie,
        body: { expiresAt: new Date(Date.now() - 86_400_000).toISOString() },
      }),
      ctx({ vaultId, memberUserId: tempId })
    );
    expect(past.status).toBe(400);
  });
});
