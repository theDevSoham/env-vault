import {
  aadEnvName,
  aadVaultName,
  decryptName,
  decryptSnapshot,
  unwrapVaultKey,
  type Snapshot,
} from "../src/lib/crypto";
import { fromB64 } from "../src/lib/crypto/sodium";
import { apiCall, CliApiError } from "./api";
import { loadCredentials, type Credentials } from "./store";

/**
 * CLI crypto session: unwraps the user private key IN MEMORY from the locally
 * stored sealed box (never persisted unwrapped — cli-key-provisioning §4),
 * then mirrors the web client's decrypt flows using the SAME crypto module.
 */

export interface CliSession {
  credentials: Credentials;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export async function openSession(): Promise<CliSession> {
  // Non-interactive mode (CI, machine-identities §1): ENVVAULT_CREDENTIALS
  // holds the base64 machine-credential blob — no login flow, no local file.
  const machineCredential = process.env.ENVVAULT_CREDENTIALS;
  if (machineCredential) {
    let parsed: { v: number; serverUrl: string; token: string; publicKey: string; privateKey: string };
    try {
      parsed = JSON.parse(Buffer.from(machineCredential, "base64").toString("utf8"));
      if (parsed.v !== 1) throw new Error("bad version");
    } catch {
      throw new Error("ENVVAULT_CREDENTIALS is not a valid machine credential");
    }
    return {
      credentials: {
        v: 1,
        serverUrl: parsed.serverUrl,
        deviceId: "service-account",
        devicePrivKey: parsed.privateKey,
        devicePubKey: parsed.publicKey,
        wrappedPrivKeyEnv: null,
        token: parsed.token,
      },
      privateKey: await fromB64(parsed.privateKey),
      publicKey: await fromB64(parsed.publicKey),
    };
  }
  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error(
      "Not logged in. Run: envvault login [--server URL] (or set ENVVAULT_CREDENTIALS for CI)"
    );
  }
  const publicKey = await fromB64(credentials.devicePubKey);
  const privateKeyDevice = await fromB64(credentials.devicePrivKey);
  // Open the sealed box addressed to the device keypair → user private key
  const userPrivateKey = await unwrapVaultKey(credentials.wrappedPrivKeyEnv, {
    publicKey,
    privateKey: privateKeyDevice,
  });
  // The user's PUBLIC key isn't stored locally; fetch from /api/me
  const me = await api<{ publicKey: string }>(credentials, "GET", "/api/me");
  return { credentials, privateKey: userPrivateKey, publicKey: await fromB64(me.publicKey) };
}

export function api<T>(credentials: Credentials, method: string, path: string, body?: unknown): Promise<T> {
  return apiCall<T>(credentials.serverUrl, method, path, { token: credentials.token, body });
}

interface VaultDetail {
  vault: { id: string; nameEnv: unknown; keyGeneration: number };
  role: string;
  environments: { id: string; nameEnv: unknown; headRevision: number }[];
  envelopes: { generation: number; envelope: unknown }[];
}

export async function getVaultKey(
  session: CliSession,
  detail: VaultDetail,
  generation: number
): Promise<Uint8Array> {
  const row = detail.envelopes.find((e) => e.generation === generation);
  if (!row) throw new Error(`no key envelope for generation ${generation}`);
  return unwrapVaultKey(row.envelope, {
    publicKey: session.publicKey,
    privateKey: session.privateKey,
  });
}

export async function loadVaultDecrypted(session: CliSession, vaultId: string) {
  const detail = await api<VaultDetail>(session.credentials, "GET", `/api/vaults/${vaultId}`);
  const vaultKey = await getVaultKey(session, detail, detail.vault.keyGeneration);
  const name = await decryptName(detail.vault.nameEnv, vaultKey, aadVaultName(vaultId));
  const environments = await Promise.all(
    detail.environments.map(async (environment) => ({
      id: environment.id,
      headRevision: environment.headRevision,
      name: await decryptName(environment.nameEnv, vaultKey, aadEnvName(vaultId, environment.id)),
    }))
  );
  return { detail, name, environments };
}

export async function loadHeadSnapshot(
  session: CliSession,
  vaultId: string,
  envId: string,
  headRevision: number
): Promise<Snapshot> {
  if (headRevision === 0) return { v: 1, keys: [] };
  const detail = await api<VaultDetail>(session.credentials, "GET", `/api/vaults/${vaultId}`);
  const { revision } = await api<{ revision: { snapshotEnv: unknown; keyGeneration: number; number: number } }>(
    session.credentials,
    "GET",
    `/api/vaults/${vaultId}/environments/${envId}/revisions/${headRevision}`
  );
  const vaultKey = await getVaultKey(session, detail, revision.keyGeneration);
  return decryptSnapshot(revision.snapshotEnv, vaultKey, {
    vaultId,
    envId,
    revision: revision.number,
    generation: revision.keyGeneration,
  });
}

export { CliApiError };
