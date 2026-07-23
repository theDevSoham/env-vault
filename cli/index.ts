#!/usr/bin/env node
import { spawn } from "node:child_process";
import { hostname, userInfo } from "node:os";
import { writeFileSync } from "node:fs";
import { generateUserKeypair, publicKeyFingerprint } from "../src/lib/crypto";
import { toB64 } from "../src/lib/crypto/sodium";
import { serializeDotenv, serializeJson } from "../src/lib/client/envformat";
import { apiCall, CliApiError } from "./api";
import { api, loadHeadSnapshot, loadVaultDecrypted, openSession, type CliSession } from "./session";
import { credentialsPath, deleteCredentials, loadCredentials, saveCredentials } from "./store";

/**
 * envvault CLI (Phase 1.5). Commands: login, logout, vaults, envs, pull, run.
 * Design: docs/cli-key-provisioning.md · runtime: ADR-008.
 * SECURITY: no --password flags exist; login is browser device-authorization.
 */

// Deployed Env Vault backend. Override per-invocation with --server, or set
// ENVVAULT_SERVER (useful for self-hosting or local dev against localhost:3000).
const DEFAULT_SERVER = process.env.ENVVAULT_SERVER ?? "https://env-vault-blond.vercel.app";

function parseArgs(argv: string[]): { command: string; flags: Map<string, string>; rest: string[] } {
  const [command = "help", ...args] = argv;
  const flags = new Map<string, string>();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--") {
      rest.push(...args.slice(i + 1));
      break;
    }
    if (args[i].startsWith("--")) {
      flags.set(args[i].slice(2), args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true");
    }
  }
  return { command, flags, rest };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(flags: Map<string, string>): Promise<void> {
  const serverUrl = flags.get("server") ?? loadCredentials()?.serverUrl ?? DEFAULT_SERVER;
  const keypair = await generateUserKeypair(); // device keypair (same X25519 primitive)
  const devicePubKey = await toB64(keypair.publicKey);
  const name = `${userInfo().username}@${hostname()}`;
  const { deviceId, userCode, pollSecret } = await apiCall<{
    deviceId: string;
    userCode: string;
    pollSecret: string;
  }>(serverUrl, "POST", "/api/devices/start", { body: { name, devicePubKey } });

  console.log(`\nTo authorize this device, open ${serverUrl}/devices and enter:\n`);
  console.log(`    code:        ${userCode}`);
  console.log(`    fingerprint: ${await publicKeyFingerprint(devicePubKey)}\n`);
  console.log("Approve ONLY if the fingerprint shown in the browser matches the one above.");
  console.log("Waiting for approval (10 minute window)…");

  for (;;) {
    await sleep(3000);
    const result = await apiCall<{ state: string; token?: string; wrappedPrivKeyEnv?: unknown }>(
      serverUrl,
      "POST",
      "/api/devices/poll",
      { body: { deviceId, pollSecret } }
    );
    if (result.state === "pending") continue;
    if (result.state === "approved" && result.token && result.wrappedPrivKeyEnv) {
      saveCredentials({
        v: 1,
        serverUrl,
        deviceId,
        devicePrivKey: await toB64(keypair.privateKey),
        devicePubKey,
        wrappedPrivKeyEnv: result.wrappedPrivKeyEnv,
        token: result.token,
      });
      console.log(`\nLogged in. Credentials stored at ${credentialsPath()} (mode 0600).`);
      console.log("Note: on Windows, file permissions are advisory — see docs/cli-key-provisioning.md §4.");
      return;
    }
    throw new Error(`Login ${result.state}. Run 'envvault login' to try again.`);
  }
}

async function logout(): Promise<void> {
  const credentials = loadCredentials();
  if (credentials) {
    await api(credentials, "POST", `/api/devices/${credentials.deviceId}/revoke`).catch(() => {});
  }
  deleteCredentials();
  console.log("Logged out; local credentials deleted and device revoked.");
}

async function listVaults(): Promise<void> {
  const session = await openSession();
  const { vaults } = await api<{ vaults: { vaultId: string; role: string }[] }>(
    session.credentials,
    "GET",
    "/api/vaults"
  );
  if (vaults.length === 0) {
    console.log("No vaults.");
    return;
  }
  for (const vault of vaults) {
    const { name } = await loadVaultDecrypted(session, vault.vaultId);
    console.log(`${vault.vaultId}  ${vault.role.padEnd(6)}  ${name}`);
  }
}

async function resolveVaultAndEnv(
  session: CliSession,
  flags: Map<string, string>,
  needEnv: boolean
): Promise<{ vaultId: string; envId?: string; envName?: string; headRevision?: number }> {
  const vaultRef = flags.get("vault");
  if (!vaultRef) throw new Error("--vault <id|name> is required");
  const { vaults } = await api<{ vaults: { vaultId: string }[] }>(session.credentials, "GET", "/api/vaults");
  let match: { vaultId: string; environments: { id: string; name: string; headRevision: number }[] } | null = null;
  for (const vault of vaults) {
    const decrypted = await loadVaultDecrypted(session, vault.vaultId);
    if (vault.vaultId === vaultRef || decrypted.name === vaultRef) {
      match = { vaultId: vault.vaultId, environments: decrypted.environments };
      break;
    }
  }
  if (!match) throw new Error(`vault not found: ${vaultRef}`);
  if (!needEnv) return { vaultId: match.vaultId };
  const envRef = flags.get("env") ?? flags.get("environment");
  if (!envRef) throw new Error("--env <id|name> is required");
  const environment = match.environments.find((e) => e.id === envRef || e.name === envRef);
  if (!environment) throw new Error(`environment not found: ${envRef}`);
  return { vaultId: match.vaultId, envId: environment.id, envName: environment.name, headRevision: environment.headRevision };
}

async function listEnvs(flags: Map<string, string>): Promise<void> {
  const session = await openSession();
  const { vaultId } = await resolveVaultAndEnv(session, flags, false);
  const { environments } = await loadVaultDecrypted(session, vaultId);
  for (const environment of environments) {
    console.log(`${environment.id}  rev ${String(environment.headRevision).padEnd(4)}  ${environment.name}`);
  }
}

async function pull(flags: Map<string, string>): Promise<void> {
  const session = await openSession();
  const { vaultId, envId, envName, headRevision } = await resolveVaultAndEnv(session, flags, true);
  const format = flags.get("format") ?? "env";
  if (format !== "env" && format !== "json") throw new Error("--format must be env or json");
  const snapshot = await loadHeadSnapshot(session, vaultId, envId!, headRevision!);
  const entries = snapshot.keys.map((key) => ({ name: key.name, value: key.value }));
  const content = format === "env" ? serializeDotenv(entries) : serializeJson(entries);
  await api(session.credentials, "POST", `/api/vaults/${vaultId}/audit/export`, {
    environmentId: envId,
    format,
  }).catch(() => {});

  const out = flags.get("out") ?? (format === "env" ? ".env" : `${envName}.json`);
  if (out === "-") {
    process.stdout.write(content);
    return;
  }
  writeFileSync(out, content, { mode: 0o600 });
  console.error(
    `WARNING: wrote PLAINTEXT secrets to ${out} — you now control this copy. ` +
      `Prefer 'envvault run' to avoid plaintext files (handoff §26).`
  );
}

async function run(flags: Map<string, string>, rest: string[]): Promise<void> {
  if (rest.length === 0) throw new Error("usage: envvault run --vault V --env E -- <command…>");
  const session = await openSession();
  const { vaultId, envId, headRevision } = await resolveVaultAndEnv(session, flags, true);
  const snapshot = await loadHeadSnapshot(session, vaultId, envId!, headRevision!);
  const childEnv = { ...process.env };
  for (const key of snapshot.keys) childEnv[key.name] = key.value;
  // Secrets exist only in this process + the child environment — nothing on disk.
  const child = spawn(rest[0], rest.slice(1), { stdio: "inherit", env: childEnv, shell: false });
  child.on("exit", (exitCode) => process.exit(exitCode ?? 1));
}

function help(): void {
  console.log(`envvault — zero-knowledge secrets CLI

  envvault login [--server URL]     authorize this device via the browser
  envvault logout                   revoke this device + delete local credentials
  envvault vaults                   list vaults (names decrypted locally)
  envvault envs --vault V           list environments
  envvault pull --vault V --env E [--format env|json] [--out PATH|-]
                                    decrypt and write secrets locally (PLAINTEXT)
  envvault run --vault V --env E -- <cmd…>
                                    run a command with secrets injected in-memory
`);
}

async function main(): Promise<void> {
  const { command, flags, rest } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "login": return login(flags);
    case "logout": return logout();
    case "vaults": return listVaults();
    case "envs": return listEnvs(flags);
    case "pull": return pull(flags);
    case "run": return run(flags, rest);
    default: return help();
  }
}

main().catch((error: unknown) => {
  if (error instanceof CliApiError && error.status === 401) {
    console.error("Not authorized (token expired or device revoked). Run: envvault login");
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
});
