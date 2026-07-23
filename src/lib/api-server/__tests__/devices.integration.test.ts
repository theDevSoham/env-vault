import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as signupPOST } from "../../../../app/api/auth/signup/route";
import { POST as startPOST } from "../../../../app/api/devices/start/route";
import { POST as pollPOST } from "../../../../app/api/devices/poll/route";
import { GET as pendingGET } from "../../../../app/api/devices/pending/route";
import { POST as approvePOST } from "../../../../app/api/devices/[deviceId]/approve/route";
import { POST as revokePOST } from "../../../../app/api/devices/[deviceId]/revoke/route";
import { GET as devicesGET } from "../../../../app/api/devices/route";
import { GET as meGET } from "../../../../app/api/me/route";
import { GET as vaultsGET, POST as vaultsPOST } from "../../../../app/api/vaults/route";
import {
  aadVaultName,
  decryptName,
  encryptName,
  encryptPrivateKey,
  generateKdfParams,
  generateUserKeypair,
  generateVaultKey,
  unwrapVaultKey,
  vaultKid,
  wrapVaultKey,
} from "../../crypto";
import { toB64 } from "../../crypto/sodium";
import { closeDb, getDb } from "../../db";
import { users as usersTable } from "../../db/schema";
import { resetRateLimits } from "../ratelimit";

/**
 * Phase 1.5 device-grant flow, end to end with REAL crypto: start → browser
 * lookup+approve (sealed-box wrap of the actual user private key to the device
 * keypair) → one-shot token delivery → bearer-authenticated API + full unwrap
 * chain (device key → user key → vault key → decrypted name) → revoke.
 */

const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

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

let cookie: string;
let userId: string;
let userKeypair: Awaited<ReturnType<typeof generateUserKeypair>>;
let deviceKeypair: Awaited<ReturnType<typeof generateUserKeypair>>;
let vaultId: string;
let vaultKey: Uint8Array;
let deviceId: string;
let pollSecret: string;
let bearer: string;

beforeAll(async () => {
  resetRateLimits();
  userKeypair = await generateUserKeypair();
  const email = `dev-${run}@test.envvault.local`;
  const signup = await signupPOST(
    req("POST", "/api/auth/signup", {
      body: {
        email,
        authKey: await toB64(crypto.getRandomValues(new Uint8Array(32))),
        kdfParams: await generateKdfParams(),
        publicKey: await toB64(userKeypair.publicKey),
        encPrivKeyEnv: await encryptPrivateKey(userKeypair.privateKey, crypto.getRandomValues(new Uint8Array(32)), email),
      },
    }),
    undefined
  );
  expect(signup.status).toBe(201);
  userId = ((await signup.json()) as { userId: string }).userId;
  cookie = signup.headers.get("set-cookie")!.split(";")[0];

  vaultId = crypto.randomUUID();
  vaultKey = await generateVaultKey();
  const vault = await vaultsPOST(
    req("POST", "/api/vaults", {
      cookie,
      body: {
        vaultId,
        nameEnv: await encryptName("Device Test Vault", vaultKey, vaultKid(vaultId, 1), aadVaultName(vaultId)),
        ownerEnvelope: await wrapVaultKey(vaultKey, userKeypair.publicKey),
      },
    }),
    undefined
  );
  expect(vault.status).toBe(201);
}, 120_000);

afterAll(async () => {
  try {
    if (userId) await getDb().delete(usersTable).where(eq(usersTable.id, userId));
  } finally {
    await closeDb();
  }
});

describe("device grant flow (CLI login)", () => {
  it("start issues a well-formed code; pending lookup shows name + pubkey", async () => {
    deviceKeypair = await generateUserKeypair();
    const start = await startPOST(
      req("POST", "/api/devices/start", { body: { name: "test@ci", devicePubKey: await toB64(deviceKeypair.publicKey) } }),
      undefined
    );
    expect(start.status).toBe(201);
    const startBody = (await start.json()) as { deviceId: string; userCode: string; pollSecret: string };
    deviceId = startBody.deviceId;
    pollSecret = startBody.pollSecret;
    expect(startBody.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const pending = await pendingGET(
      req("GET", `/api/devices/pending?code=${startBody.userCode}`, { cookie }),
      undefined
    );
    expect(pending.status).toBe(200);
    const pendingBody = (await pending.json()) as { deviceId: string; name: string; devicePubKey: string };
    expect(pendingBody.deviceId).toBe(deviceId);
    expect(pendingBody.devicePubKey).toBe(await toB64(deviceKeypair.publicKey));
  });

  it("poll is pending pre-approval and requires the poll secret", async () => {
    const pending = await pollPOST(req("POST", "/api/devices/poll", { body: { deviceId, pollSecret } }), undefined);
    expect(((await pending.json()) as { state: string }).state).toBe("pending");

    const wrongSecret = await pollPOST(
      req("POST", "/api/devices/poll", { body: { deviceId, pollSecret: "d3Jvbmc" } }),
      undefined
    );
    expect(wrongSecret.status).toBe(404);
  });

  it("approve wraps the real user private key; token delivered exactly once", async () => {
    const wrappedPrivKeyEnv = await wrapVaultKey(userKeypair.privateKey, deviceKeypair.publicKey);
    const approve = await approvePOST(
      req("POST", `/api/devices/${deviceId}/approve`, { cookie, body: { wrappedPrivKeyEnv } }),
      ctx({ deviceId })
    );
    expect(approve.status).toBe(200);

    const poll = await pollPOST(req("POST", "/api/devices/poll", { body: { deviceId, pollSecret } }), undefined);
    const pollBody = (await poll.json()) as { state: string; token?: string; wrappedPrivKeyEnv?: unknown };
    expect(pollBody.state).toBe("approved");
    expect(pollBody.token).toBeTruthy();
    bearer = pollBody.token!;

    // Second poll must NOT deliver a token again (one-shot claim)
    const again = await pollPOST(req("POST", "/api/devices/poll", { body: { deviceId, pollSecret } }), undefined);
    expect(((await again.json()) as { state: string }).state).toBe("consumed");

    // Device-side unwrap chain: device key → user private key (byte-equal)
    const recovered = await unwrapVaultKey(pollBody.wrappedPrivKeyEnv, deviceKeypair);
    expect(recovered).toEqual(userKeypair.privateKey);
  });

  it("bearer token authenticates the API; full decrypt chain works", async () => {
    const me = await meGET(req("GET", "/api/me", { bearer }), undefined);
    expect(me.status).toBe(200);

    const vaults = await vaultsGET(req("GET", "/api/vaults", { bearer }), undefined);
    expect(vaults.status).toBe(200);
    const { vaults: list } = (await vaults.json()) as { vaults: { vaultId: string; nameEnv: unknown }[] };
    const mine = list.find((v) => v.vaultId === vaultId)!;
    // CLI chain: sealed box → user key already recovered; unwrap vault key + decrypt name
    const name = await decryptName(mine.nameEnv, vaultKey, aadVaultName(vaultId));
    expect(name).toBe("Device Test Vault");

    const garbage = await vaultsGET(req("GET", "/api/vaults", { bearer: "bm90LWEtdG9rZW4" }), undefined);
    expect(garbage.status).toBe(401);
  });

  it("device list shows the grant; revoke kills the bearer token", async () => {
    const listResponse = await devicesGET(req("GET", "/api/devices", { cookie }), undefined);
    const { devices } = (await listResponse.json()) as { devices: { id: string; name: string }[] };
    expect(devices.map((d) => d.id)).toContain(deviceId);

    const revoke = await revokePOST(req("POST", `/api/devices/${deviceId}/revoke`, { cookie }), ctx({ deviceId }));
    expect(revoke.status).toBe(200);

    const after = await vaultsGET(req("GET", "/api/vaults", { bearer }), undefined);
    expect(after.status).toBe(401); // token dead immediately
  });
});
