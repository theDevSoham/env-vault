import { aadDiff, aadSnapshot, vaultKid } from "./aad";
import type { RecordEnvelope } from "./envelope";
import { InvalidPlaintextError } from "./errors";
import { decryptRecord, encryptRecord } from "./record";
import { randomBytes, toB64, utf8Decode, utf8Encode } from "./sodium";

/**
 * Environment snapshots and structural diffs (crypto-spec §5–6, revision-model).
 *
 * Snapshots carry stable random per-key ids so renames are detected exactly
 * (same id, new name) with no heuristics. Plaintext snapshots exist only in
 * client memory.
 */

export interface SnapshotKey {
  /** Stable random 8-byte id (base64url), preserved across renames. */
  id: string;
  name: string;
  value: string;
}

export interface Snapshot {
  v: 1;
  keys: SnapshotKey[];
}

export interface StructuralDiff {
  v: 1;
  added: string[];
  removed: string[];
  renamed: { from: string; to: string }[];
  modified: string[];
}

/** Identifies where a snapshot/diff ciphertext lives — feeds kid + AAD binding. */
export interface SnapshotLocation {
  vaultId: string;
  envId: string;
  revision: number;
  generation: number;
}

/** New stable id for a secret key entry (crypto-spec §5). */
export async function newKeyId(): Promise<string> {
  return toB64(await randomBytes(8));
}

export function emptySnapshot(): Snapshot {
  return { v: 1, keys: [] };
}

function validateSnapshot(x: unknown): Snapshot {
  if (typeof x !== "object" || x === null || (x as Snapshot).v !== 1) {
    throw new InvalidPlaintextError("decrypted payload is not a v1 snapshot");
  }
  const keys = (x as Snapshot).keys;
  if (!Array.isArray(keys)) {
    throw new InvalidPlaintextError("snapshot keys is not an array");
  }
  const seen = new Set<string>();
  for (const k of keys) {
    if (
      typeof k !== "object" || k === null ||
      typeof k.id !== "string" || k.id.length === 0 ||
      typeof k.name !== "string" || typeof k.value !== "string"
    ) {
      throw new InvalidPlaintextError("snapshot entry is malformed");
    }
    if (seen.has(k.id)) throw new InvalidPlaintextError("snapshot contains duplicate key ids");
    seen.add(k.id);
  }
  return x as Snapshot;
}

function validateDiff(x: unknown): StructuralDiff {
  const d = x as StructuralDiff;
  if (
    typeof x !== "object" || x === null || d.v !== 1 ||
    !Array.isArray(d.added) || !Array.isArray(d.removed) ||
    !Array.isArray(d.renamed) || !Array.isArray(d.modified)
  ) {
    throw new InvalidPlaintextError("decrypted payload is not a v1 structural diff");
  }
  return d;
}

/** Encrypt a snapshot bound to its vault/environment/revision (AAD) and key generation (kid). */
export async function encryptSnapshot(
  snapshot: Snapshot,
  vaultKey: Uint8Array,
  loc: SnapshotLocation
): Promise<RecordEnvelope> {
  validateSnapshot(snapshot);
  return encryptRecord(
    utf8Encode(JSON.stringify(snapshot)),
    vaultKey,
    vaultKid(loc.vaultId, loc.generation),
    aadSnapshot(loc.vaultId, loc.envId, loc.revision)
  );
}

export async function decryptSnapshot(
  envelope: unknown,
  vaultKey: Uint8Array,
  loc: SnapshotLocation
): Promise<Snapshot> {
  const plaintext = await decryptRecord(
    envelope,
    vaultKey,
    aadSnapshot(loc.vaultId, loc.envId, loc.revision)
  );
  return validateSnapshot(JSON.parse(utf8Decode(plaintext)));
}

/**
 * Structural diff between two snapshots, by stable key id (crypto-spec §6).
 * Names only — never values. A key that is renamed AND has a changed value
 * appears in `renamed` and in `modified` (under its new name).
 * All arrays are sorted for deterministic output.
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): StructuralDiff {
  validateSnapshot(before);
  validateSnapshot(after);
  const beforeById = new Map(before.keys.map((k) => [k.id, k]));
  const afterById = new Map(after.keys.map((k) => [k.id, k]));

  const added: string[] = [];
  const removed: string[] = [];
  const renamed: { from: string; to: string }[] = [];
  const modified: string[] = [];

  for (const [id, a] of afterById) {
    const b = beforeById.get(id);
    if (!b) {
      added.push(a.name);
      continue;
    }
    if (b.name !== a.name) renamed.push({ from: b.name, to: a.name });
    if (b.value !== a.value) modified.push(a.name);
  }
  for (const [id, b] of beforeById) {
    if (!afterById.has(id)) removed.push(b.name);
  }

  added.sort();
  removed.sort();
  modified.sort();
  renamed.sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
  return { v: 1, added, removed, renamed, modified };
}

/** Encrypt diff metadata bound to the revision it describes. */
export async function encryptDiff(
  diff: StructuralDiff,
  vaultKey: Uint8Array,
  loc: SnapshotLocation
): Promise<RecordEnvelope> {
  validateDiff(diff);
  return encryptRecord(
    utf8Encode(JSON.stringify(diff)),
    vaultKey,
    vaultKid(loc.vaultId, loc.generation),
    aadDiff(loc.vaultId, loc.envId, loc.revision)
  );
}

export async function decryptDiff(
  envelope: unknown,
  vaultKey: Uint8Array,
  loc: SnapshotLocation
): Promise<StructuralDiff> {
  const plaintext = await decryptRecord(
    envelope,
    vaultKey,
    aadDiff(loc.vaultId, loc.envId, loc.revision)
  );
  return validateDiff(JSON.parse(utf8Decode(plaintext)));
}
