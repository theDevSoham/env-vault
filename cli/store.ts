import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Local credential store (ADR-008, cli-key-provisioning §4).
 * ~/.envvault/credentials.json, chmod 0600. Contains the DEVICE private key,
 * the wrapped user-key envelope (enc.box — still ciphertext), and the bearer
 * token. The user private key is never stored unwrapped.
 */

export interface Credentials {
  v: 1;
  serverUrl: string;
  deviceId: string;
  devicePrivKey: string; // base64url
  devicePubKey: string; // base64url
  wrappedPrivKeyEnv: unknown; // enc.box → device pubkey
  token: string;
  email?: string;
}

const DIR = join(homedir(), ".envvault");
const FILE = join(DIR, "credentials.json");

export function saveCredentials(credentials: Credentials): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  try {
    chmodSync(FILE, 0o600);
  } catch {
    /* Windows: mode bits are advisory — documented limitation (ADR-008) */
  }
}

export function loadCredentials(): Credentials | null {
  if (!existsSync(FILE)) return null;
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Credentials;
    return parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function deleteCredentials(): void {
  rmSync(FILE, { force: true });
}

export function credentialsPath(): string {
  return FILE;
}
