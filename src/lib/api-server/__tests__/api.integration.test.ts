import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as kdfGET } from "../../../../app/api/auth/kdf/route";
import { POST as loginPOST } from "../../../../app/api/auth/login/route";
import { POST as logoutPOST } from "../../../../app/api/auth/logout/route";
import { POST as signupPOST } from "../../../../app/api/auth/signup/route";
import { GET as meGET } from "../../../../app/api/me/route";
import { POST as acceptPOST } from "../../../../app/api/invitations/[invitationId]/accept/route";
import { GET as vaultsGET, POST as vaultsPOST } from "../../../../app/api/vaults/route";
import { DELETE as vaultDELETE, GET as vaultGET } from "../../../../app/api/vaults/[vaultId]/route";
import { POST as envPOST } from "../../../../app/api/vaults/[vaultId]/environments/route";
import {
  GET as revisionsGET,
  POST as revisionsPOST,
} from "../../../../app/api/vaults/[vaultId]/environments/[envId]/revisions/route";
import { POST as invitePOST } from "../../../../app/api/vaults/[vaultId]/invitations/route";
import { POST as rotatePOST } from "../../../../app/api/vaults/[vaultId]/rotate/route";
import { GET as auditGET } from "../../../../app/api/vaults/[vaultId]/audit/route";
import { closeDb, getDb } from "../../db";
import { users as usersTable } from "../../db/schema";
import { resetRateLimits } from "../ratelimit";

/**
 * API integration tests (plannings/04 D2/D3): route handlers invoked directly
 * as functions against the real dev database. Focus: the authorization matrix
 * (anonymous / non-member / member / owner) and the auth lifecycle.
 */

const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const email = (name: string) => `api-${run}-${name}@test.envvault.local`;

const fakeRec = (label: string) => ({ v: 1, t: "enc.rec", alg: "A256GCM", kid: "k:1", n: "AAAAAAAAAAAAAAAA", aad: "YQ", ct: `Y3Qt${label.replace(/[^A-Za-z0-9]/g, "")}` });
const fakeBox = (label: string) => ({ v: 1, t: "enc.box", alg: "X25519-SEALED", rcp: "cnB", ct: `Y3Qt${label.replace(/[^A-Za-z0-9]/g, "")}` });
const kdfParams = { v: 1, alg: "argon2id13", salt: "c2FsdHNhbHRzYWx0c2E", ops: 3, mem: 67108864, outLen: 32 };

// authKeys are high-entropy base64url strings in reality; these are stand-ins
const AUTH = { owner: "b3duZXItYXV0aC1rZXktMzItYnl0ZXMtLS0tLS0t", alice: "YWxpY2UtYXV0aC1rZXktMzItYnl0ZXMtLS0tLS0", mallory: "bWFsbG9yeS1hdXRoLWtleS0zMi1ieXRlcy0tLS0" };

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

function cookieOf(response: Response): string {
  const header = response.headers.get("set-cookie");
  expect(header).toBeTruthy();
  return header!.split(";")[0];
}

let ownerCookie: string;
let aliceCookie: string;
let malloryCookie: string;
let ownerId: string;
let aliceId: string;
let malloryId: string;
let vaultId: string;
let envId: string;

async function signup(name: keyof typeof AUTH): Promise<{ cookie: string; userId: string }> {
  const response = await signupPOST(
    req("POST", "/api/auth/signup", {
      body: { email: email(name), authKey: AUTH[name], kdfParams, publicKey: `cGstJHt${name}`, encPrivKeyEnv: fakeRec(`priv-${name}`) },
    }),
    undefined
  );
  expect(response.status).toBe(201);
  const { userId } = (await response.json()) as { userId: string };
  return { cookie: cookieOf(response), userId };
}

beforeAll(async () => {
  resetRateLimits();
  ({ cookie: ownerCookie, userId: ownerId } = await signup("owner"));
  ({ cookie: aliceCookie, userId: aliceId } = await signup("alice"));
  ({ cookie: malloryCookie, userId: malloryId } = await signup("mallory"));
}, 120_000);

afterAll(async () => {
  try {
    for (const id of [ownerId, aliceId, malloryId]) {
      if (id) await getDb().delete(usersTable).where(eq(usersTable.id, id));
    }
  } finally {
    await closeDb();
  }
});

describe("auth lifecycle", () => {
  it("kdf endpoint returns params for known and dummy for unknown emails, same shape", async () => {
    const known = await kdfGET(req("GET", `/api/auth/kdf?email=${email("owner")}`), undefined);
    const unknown = await kdfGET(req("GET", `/api/auth/kdf?email=ghost-${run}@nowhere.local`), undefined);
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    const knownBody = (await known.json()) as { kdfParams: Record<string, unknown> };
    const unknownBody = (await unknown.json()) as { kdfParams: Record<string, unknown> };
    expect(Object.keys(knownBody.kdfParams).sort()).toEqual(Object.keys(unknownBody.kdfParams).sort());
  });

  it("login succeeds with the right authKey, fails uniformly otherwise", async () => {
    const ok = await loginPOST(req("POST", "/api/auth/login", { body: { email: email("owner"), authKey: AUTH.owner } }), undefined);
    expect(ok.status).toBe(200);

    const wrongKey = await loginPOST(req("POST", "/api/auth/login", { body: { email: email("owner"), authKey: AUTH.alice } }), undefined);
    const noUser = await loginPOST(req("POST", "/api/auth/login", { body: { email: `ghost-${run}@nowhere.local`, authKey: AUTH.owner } }), undefined);
    expect(wrongKey.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(await wrongKey.json()).toEqual(await noUser.json()); // indistinguishable
  });

  it("session works, logout invalidates it", async () => {
    const login = await loginPOST(req("POST", "/api/auth/login", { body: { email: email("mallory"), authKey: AUTH.mallory } }), undefined);
    const cookie = cookieOf(login);
    expect((await meGET(req("GET", "/api/me", { cookie }), undefined)).status).toBe(200);
    await logoutPOST(req("POST", "/api/auth/logout", { cookie }), undefined);
    expect((await meGET(req("GET", "/api/me", { cookie }), undefined)).status).toBe(401);
  });

  it("me returns identity material, never a plaintext secret shape", async () => {
    const response = await meGET(req("GET", "/api/me", { cookie: ownerCookie }), undefined);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.publicKey).toBeTruthy();
    expect(body.encPrivKeyEnv).toMatchObject({ t: "enc.rec" });
    expect(body).not.toHaveProperty("authVerifier");
  });
});

describe("authorization matrix", () => {
  it("owner creates vault + environment; commits a revision", async () => {
    const vault = await vaultsPOST(req("POST", "/api/vaults", { cookie: ownerCookie, body: { vaultId: crypto.randomUUID(), nameEnv: fakeRec("vname"), ownerEnvelope: fakeBox("vk-owner") } }), undefined);
    expect(vault.status).toBe(201);
    vaultId = ((await vault.json()) as { vaultId: string }).vaultId;

    const environment = await envPOST(req("POST", `/api/vaults/${vaultId}/environments`, { cookie: ownerCookie, body: { environmentId: crypto.randomUUID(), nameEnv: fakeRec("ename") } }), ctx({ vaultId }));
    expect(environment.status).toBe(201);
    envId = ((await environment.json()) as { environmentId: string }).environmentId;

    const commit = await revisionsPOST(
      req("POST", `/api/vaults/${vaultId}/environments/${envId}/revisions`, { cookie: ownerCookie, body: { baseRevision: 0, keyGeneration: 1, snapshotEnv: fakeRec("snap1"), diffEnv: fakeRec("diff1"), message: "Initial" } }),
      ctx({ vaultId, envId })
    );
    expect(commit.status).toBe(201);
  });

  it("anonymous requests get 401 everywhere", async () => {
    for (const response of [
      await vaultsGET(req("GET", "/api/vaults"), undefined),
      await vaultGET(req("GET", `/api/vaults/${vaultId}`), ctx({ vaultId })),
      await revisionsGET(req("GET", `/api/vaults/${vaultId}/environments/${envId}/revisions`), ctx({ vaultId, envId })),
      await auditGET(req("GET", `/api/vaults/${vaultId}/audit`), ctx({ vaultId })),
    ]) {
      expect(response.status).toBe(401);
    }
  });

  it("non-member (mallory) gets 404 — vault existence is not revealed", async () => {
    const login = await loginPOST(req("POST", "/api/auth/login", { body: { email: email("mallory"), authKey: AUTH.mallory } }), undefined);
    malloryCookie = cookieOf(login);
    for (const response of [
      await vaultGET(req("GET", `/api/vaults/${vaultId}`, { cookie: malloryCookie }), ctx({ vaultId })),
      await revisionsGET(req("GET", `/api/vaults/${vaultId}/environments/${envId}/revisions`, { cookie: malloryCookie }), ctx({ vaultId, envId })),
      await auditGET(req("GET", `/api/vaults/${vaultId}/audit`, { cookie: malloryCookie }), ctx({ vaultId })),
      await vaultDELETE(req("DELETE", `/api/vaults/${vaultId}`, { cookie: malloryCookie }), ctx({ vaultId })),
    ]) {
      expect(response.status).toBe(404);
    }
  });

  it("invited member can read but not perform owner actions", async () => {
    const invite = await invitePOST(
      req("POST", `/api/vaults/${vaultId}/invitations`, { cookie: ownerCookie, body: { inviteeEmail: email("alice"), role: "member", envelope: fakeBox("vk-alice") } }),
      ctx({ vaultId })
    );
    expect(invite.status).toBe(201);
    const { invitationId } = (await invite.json()) as { invitationId: string };

    // mallory cannot accept alice's invitation
    const stolen = await acceptPOST(req("POST", `/api/invitations/${invitationId}/accept`, { cookie: malloryCookie }), ctx({ invitationId }));
    expect(stolen.status).toBe(404);

    const accept = await acceptPOST(req("POST", `/api/invitations/${invitationId}/accept`, { cookie: aliceCookie }), ctx({ invitationId }));
    expect(accept.status).toBe(200);
    expect(((await accept.json()) as { state: string }).state).toBe("active");

    // member can read the vault and commit revisions...
    expect((await vaultGET(req("GET", `/api/vaults/${vaultId}`, { cookie: aliceCookie }), ctx({ vaultId }))).status).toBe(200);
    const memberCommit = await revisionsPOST(
      req("POST", `/api/vaults/${vaultId}/environments/${envId}/revisions`, { cookie: aliceCookie, body: { baseRevision: 1, keyGeneration: 1, snapshotEnv: fakeRec("snap2"), diffEnv: fakeRec("diff2") } }),
      ctx({ vaultId, envId })
    );
    expect(memberCommit.status).toBe(201);

    // ...but owner-only actions are 403
    const envAttempt = await envPOST(req("POST", `/api/vaults/${vaultId}/environments`, { cookie: aliceCookie, body: { nameEnv: fakeRec("x") } }), ctx({ vaultId }));
    const deleteAttempt = await vaultDELETE(req("DELETE", `/api/vaults/${vaultId}`, { cookie: aliceCookie }), ctx({ vaultId }));
    expect(envAttempt.status).toBe(403);
    expect(deleteAttempt.status).toBe(403);
  });

  it("stale revision commit returns 409 with currentHead", async () => {
    const conflict = await revisionsPOST(
      req("POST", `/api/vaults/${vaultId}/environments/${envId}/revisions`, { cookie: ownerCookie, body: { baseRevision: 0, keyGeneration: 1, snapshotEnv: fakeRec("stale"), diffEnv: fakeRec("stale") } }),
      ctx({ vaultId, envId })
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()) as object).toMatchObject({ error: "revision_conflict", currentHead: 2 });
  });

  it("member cannot rotate; owner rotation removes the member end-to-end", async () => {
    const memberAttempt = await rotatePOST(
      req("POST", `/api/vaults/${vaultId}/rotate`, { cookie: aliceCookie, body: { baseGeneration: 1, removedUserId: ownerId, newVaultNameEnv: fakeRec("v2"), newEnvelopes: [], newRevisions: [], fileRewrites: [] } }),
      ctx({ vaultId })
    );
    expect(memberAttempt.status).toBe(403);

    const rotate = await rotatePOST(
      req("POST", `/api/vaults/${vaultId}/rotate`, {
        cookie: ownerCookie,
        body: {
          baseGeneration: 1,
          removedUserId: aliceId,
          newVaultNameEnv: fakeRec("vname-g2"),
          newEnvelopes: [{ userId: ownerId, envelope: fakeBox("vk-owner-g2") }],
          newRevisions: [{ environmentId: envId, baseRevision: 2, snapshotEnv: fakeRec("snap-g2"), diffEnv: fakeRec("diff-g2"), nameEnv: fakeRec("ename-g2") }],
          fileRewrites: [],
        },
      }),
      ctx({ vaultId })
    );
    expect(rotate.status).toBe(200);

    // alice is cryptographically + authz-wise out
    expect((await vaultGET(req("GET", `/api/vaults/${vaultId}`, { cookie: aliceCookie }), ctx({ vaultId }))).status).toBe(404);
  });

  it("invalid envelopes are rejected 422 before touching the db", async () => {
    const response = await vaultsPOST(
      req("POST", "/api/vaults", { cookie: ownerCookie, body: { vaultId: crypto.randomUUID(), nameEnv: { v: 9, t: "enc.rec" }, ownerEnvelope: fakeBox("x") } }),
      undefined
    );
    expect(response.status).toBe(422);
  });

  it("audit trail is member-visible and body-free; teardown", async () => {
    const audit = await auditGET(req("GET", `/api/vaults/${vaultId}/audit`, { cookie: ownerCookie }), ctx({ vaultId }));
    expect(audit.status).toBe(200);
    const { events } = (await audit.json()) as { events: { type: string }[] };
    for (const t of ["vault_created", "environment_created", "revision_created", "member_invited", "invitation_accepted", "member_removed", "vault_key_rotated"]) {
      expect(events.map((e) => e.type)).toContain(t);
    }
    expect(JSON.stringify(events)).not.toContain("Y3Qt"); // no ciphertext blobs in audit

    const del = await vaultDELETE(req("DELETE", `/api/vaults/${vaultId}`, { cookie: ownerCookie }), ctx({ vaultId }));
    expect(del.status).toBe(200);
  });
});
