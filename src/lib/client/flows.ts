"use client";

import { api, type VaultDetailDto } from "../api/client";
import {
  aadEnvName,
  aadFileName,
  aadVaultName,
  createFileDecryptStream,
  createFileEncryptStream,
  decryptDiff,
  decryptName,
  decryptPrivateKey,
  decryptSnapshot,
  deriveMaster,
  diffSnapshots,
  emptySnapshot,
  encryptDiff,
  encryptName,
  encryptPrivateKey,
  encryptSnapshot,
  generateKdfParams,
  generateUserKeypair,
  generateVaultKey,
  publicKeyFingerprint,
  splitMaster,
  unwrapVaultKey,
  vaultKid,
  wrapVaultKey,
  type KdfParams,
  type Snapshot,
  type StructuralDiff,
} from "../crypto";
import { fromB64, toB64 } from "../crypto/sodium";
import { serializeDotenv, serializeJson } from "./envformat";
import {
  cacheVaultKey,
  clearSession,
  getCachedVaultKey,
  getPrivateKey,
  getSessionState,
  setSession,
  setUnlocked,
} from "./keystore";

/**
 * Client-side protocol flows (plannings/05). This module is the only place
 * that combines the crypto module with the API client. UI components call
 * these functions and render results — no crypto logic in components.
 */

const b64 = { to: toB64, from: fromB64 };

function requireKeys(): { publicKey: string; privateKey: Uint8Array } {
  const state = getSessionState();
  const privateKey = getPrivateKey();
  if (!state.publicKey || !privateKey) throw new Error("locked");
  return { publicKey: state.publicKey, privateKey };
}

// ————— auth (E1/E2) —————

export async function signup(email: string, password: string): Promise<void> {
  const kdfParams = await generateKdfParams();
  const master = await deriveMaster(password, kdfParams);
  const { kek, authKey } = await splitMaster(master);
  const keypair = await generateUserKeypair();
  const encPrivKeyEnv = await encryptPrivateKey(
    keypair.privateKey,
    kek,
    email.toLowerCase() // identifier: userId doesn't exist yet (aad.ts note)
  );
  const publicKeyB64 = await b64.to(keypair.publicKey);
  const { userId } = await api.signup({
    email,
    authKey: await b64.to(authKey),
    kdfParams,
    publicKey: publicKeyB64,
    encPrivKeyEnv,
  });
  setSession(userId, email, publicKeyB64);
  setUnlocked(keypair.privateKey);
}

export async function login(email: string, password: string): Promise<void> {
  const { kdfParams } = await api.kdf(email);
  const master = await deriveMaster(password, kdfParams as KdfParams);
  const { authKey } = await splitMaster(master);
  const { userId } = await api.login({ email, authKey: await b64.to(authKey) });
  setSession(userId, email, "");
  await unlock(password); // fetch /me + decrypt private key
}

/** Resume an existing cookie session (no keys yet — UI shows UnlockGate). */
export async function resumeSession(): Promise<boolean> {
  try {
    const me = await api.me();
    setSession(me.userId, me.email, me.publicKey);
    return true;
  } catch {
    return false;
  }
}

/** Decrypt the private key into memory from a password (fresh tab / reload). */
export async function unlock(password: string): Promise<void> {
  const me = await api.me();
  const master = await deriveMaster(password, me.kdfParams as KdfParams);
  const { kek } = await splitMaster(master);
  const privateKey = await decryptPrivateKey(me.encPrivKeyEnv, kek, me.email.toLowerCase());
  setSession(me.userId, me.email, me.publicKey);
  setUnlocked(privateKey);
}

export async function logout(): Promise<void> {
  await api.logout();
  clearSession();
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const me = await api.me();
  const oldMaster = await deriveMaster(oldPassword, me.kdfParams as KdfParams);
  const { kek: oldKek, authKey: oldAuthKey } = await splitMaster(oldMaster);
  const privateKey = await decryptPrivateKey(me.encPrivKeyEnv, oldKek, me.email.toLowerCase());

  const newKdfParams = await generateKdfParams();
  const newMaster = await deriveMaster(newPassword, newKdfParams);
  const { kek: newKek, authKey: newAuthKey } = await splitMaster(newMaster);
  const newEncPrivKeyEnv = await encryptPrivateKey(privateKey, newKek, me.email.toLowerCase());
  await api.changePassword({
    oldAuthKey: await b64.to(oldAuthKey),
    newAuthKey: await b64.to(newAuthKey),
    newKdfParams,
    newEncPrivKeyEnv,
  });
}

// ————— vault keys —————

async function unwrapForGeneration(detail: VaultDetailDto, generation: number): Promise<Uint8Array> {
  const cached = getCachedVaultKey(detail.vault.id, generation);
  if (cached) return cached;
  const row = detail.envelopes.find((e) => e.generation === generation);
  if (!row) throw new Error("no key envelope for generation");
  const { publicKey, privateKey } = requireKeys();
  const vaultKey = await unwrapVaultKey(row.envelope, {
    publicKey: await b64.from(publicKey),
    privateKey,
  });
  cacheVaultKey(detail.vault.id, generation, vaultKey);
  return vaultKey;
}

// ————— vaults & environments (E3) —————

export async function createVault(name: string): Promise<string> {
  const { publicKey } = requireKeys();
  const vaultId = crypto.randomUUID();
  const vaultKey = await generateVaultKey();
  const nameEnv = await encryptName(name, vaultKey, vaultKid(vaultId, 1), aadVaultName(vaultId));
  const ownerEnvelope = await wrapVaultKey(vaultKey, await b64.from(publicKey));
  await api.createVault({ vaultId, nameEnv, ownerEnvelope });
  cacheVaultKey(vaultId, 1, vaultKey);
  return vaultId;
}

export interface DecryptedVault {
  detail: VaultDetailDto;
  name: string;
  environments: { id: string; name: string; headRevision: number }[];
}

export async function loadVault(vaultId: string): Promise<DecryptedVault> {
  const detail = await api.vaultDetail(vaultId);
  const generation = detail.vault.keyGeneration;
  const vaultKey = await unwrapForGeneration(detail, generation);
  const name = await decryptName(detail.vault.nameEnv, vaultKey, aadVaultName(vaultId));
  const environments = await Promise.all(
    detail.environments.map(async (environment) => ({
      id: environment.id,
      name: await decryptName(environment.nameEnv, vaultKey, aadEnvName(vaultId, environment.id)),
      headRevision: environment.headRevision,
    }))
  );
  return { detail, name, environments };
}

/** Decrypt a vault name for the vault list (needs one unwrap per vault). */
export async function decryptVaultListName(item: {
  vaultId: string;
  nameEnv: unknown;
  keyGeneration: number;
}): Promise<string> {
  const detail = await api.vaultDetail(item.vaultId);
  const vaultKey = await unwrapForGeneration(detail, item.keyGeneration);
  return decryptName(item.nameEnv, vaultKey, aadVaultName(item.vaultId));
}

export async function createEnvironment(vaultId: string, name: string): Promise<string> {
  const detail = await api.vaultDetail(vaultId);
  const generation = detail.vault.keyGeneration;
  const vaultKey = await unwrapForGeneration(detail, generation);
  const environmentId = crypto.randomUUID();
  const nameEnv = await encryptName(
    name,
    vaultKey,
    vaultKid(vaultId, generation),
    aadEnvName(vaultId, environmentId)
  );
  await api.createEnvironment(vaultId, { environmentId, nameEnv });
  return environmentId;
}

// ————— snapshots & commits (E4) —————

/** Load and decrypt any revision's snapshot (0 = the empty pre-history state). */
export async function loadSnapshot(
  vaultId: string,
  envId: string,
  revisionNumber: number
): Promise<Snapshot> {
  if (revisionNumber === 0) return emptySnapshot();
  const detail = await api.vaultDetail(vaultId);
  const { revision } = await api.getRevision(vaultId, envId, revisionNumber);
  const vaultKey = await unwrapForGeneration(detail, revision.keyGeneration);
  return decryptSnapshot(revision.snapshotEnv, vaultKey, {
    vaultId,
    envId,
    revision: revision.number,
    generation: revision.keyGeneration,
  });
}

/** Structural comparison of two arbitrary revisions (revision-model §4).
 *  Both snapshots decrypt locally; the diff never touches the server. */
export async function compareRevisions(
  vaultId: string,
  envId: string,
  from: number,
  to: number
): Promise<StructuralDiff> {
  const [before, after] = await Promise.all([
    loadSnapshot(vaultId, envId, from),
    loadSnapshot(vaultId, envId, to),
  ]);
  return diffSnapshots(before, after);
}

/** Restore revision `target` as a NEW revision on top of `currentHead`
 *  (revision-model §3): history is never rewritten, and the restored state is
 *  re-encrypted under the CURRENT vault key generation. */
export async function restoreRevision(
  vaultId: string,
  envId: string,
  target: number,
  currentHead: number
): Promise<number> {
  const [targetSnapshot, headSnapshot] = await Promise.all([
    loadSnapshot(vaultId, envId, target),
    loadSnapshot(vaultId, envId, currentHead),
  ]);
  return commitSnapshot(
    vaultId,
    envId,
    { revision: currentHead, snapshot: headSnapshot },
    targetSnapshot,
    `Restored state from Revision ${target}`,
    target
  );
}

/** Encrypt + commit `after` as revision base+1. Throws RevisionConflict on stale base. */
export async function commitSnapshot(
  vaultId: string,
  envId: string,
  base: { revision: number; snapshot: Snapshot },
  after: Snapshot,
  message?: string,
  restoredFromRevision?: number
): Promise<number> {
  const detail = await api.vaultDetail(vaultId);
  const generation = detail.vault.keyGeneration;
  const vaultKey = await unwrapForGeneration(detail, generation);
  const location = { vaultId, envId, revision: base.revision + 1, generation };
  const diff = diffSnapshots(base.snapshot, after);
  const snapshotEnv = await encryptSnapshot(after, vaultKey, location);
  const diffEnv = await encryptDiff(diff, vaultKey, location);
  const { number } = await api.commitRevision(vaultId, envId, {
    baseRevision: base.revision,
    keyGeneration: generation,
    message,
    snapshotEnv,
    diffEnv,
    restoredFromRevision,
  });
  return number;
}

export async function decryptRevisionDiff(
  vaultId: string,
  envId: string,
  meta: { number: number; keyGeneration: number; diffEnv: unknown }
): Promise<StructuralDiff> {
  const detail = await api.vaultDetail(vaultId);
  const vaultKey = await unwrapForGeneration(detail, meta.keyGeneration);
  return decryptDiff(meta.diffEnv, vaultKey, {
    vaultId,
    envId,
    revision: meta.number,
    generation: meta.keyGeneration,
  });
}

// ————— CLI device approval (Phase 1.5, cli-key-provisioning §2 step 4–5) —————

export async function lookupPendingDevice(
  code: string
): Promise<{ deviceId: string; name: string; devicePubKey: string; fingerprint: string }> {
  const device = await api.pendingDevice(code);
  return { ...device, fingerprint: await publicKeyFingerprint(device.devicePubKey) };
}

/** Wrap the in-memory user private key to the device's public key and approve.
 *  The sealed box is payload-agnostic — same primitive as vault-key wrapping. */
export async function approveDevice(deviceId: string, devicePubKey: string): Promise<void> {
  const { privateKey } = requireKeys();
  const wrappedPrivKeyEnv = await wrapVaultKey(privateKey, await b64.from(devicePubKey));
  await api.approveDevice(deviceId, { wrappedPrivKeyEnv });
}

export async function deviceFingerprint(publicKey: string): Promise<string> {
  return publicKeyFingerprint(publicKey);
}

// ————— service accounts (Phase 2, machine-identities §1) —————

/**
 * Create a machine identity: keypair generated HERE, vault key wrapped HERE;
 * the server receives only the public key + envelope and returns the bearer
 * token once. Returns the one-time machine credential (base64 JSON blob) —
 * shown once, never recoverable (the private key never touches the server).
 */
export async function createServiceAccount(
  vaultId: string,
  name: string,
  membershipTtlDays?: number
): Promise<{ credential: string; fingerprint: string }> {
  const detail = await api.vaultDetail(vaultId);
  const generation = detail.vault.keyGeneration;
  const vaultKey = await unwrapForGeneration(detail, generation);
  const keypair = await generateUserKeypair();
  const publicKey = await b64.to(keypair.publicKey);
  const envelope = await wrapVaultKey(vaultKey, keypair.publicKey);
  const { token } = await api.createServiceAccount(vaultId, {
    name,
    publicKey,
    envelope,
    keyGeneration: generation,
    membershipTtlDays,
  });
  const credential = btoa(
    JSON.stringify({
      v: 1,
      serverUrl: window.location.origin,
      token,
      publicKey,
      privateKey: await b64.to(keypair.privateKey),
    })
  );
  return { credential, fingerprint: await publicKeyFingerprint(publicKey) };
}

// ————— export (Phase G, handoff §8) —————

/**
 * Generate an export ENTIRELY client-side: decrypt the head snapshot in
 * memory, serialize, hand back the text for a local download. The plaintext
 * never travels to the server — only the metadata audit event does
 * (environment id + format, handoff §27).
 */
export async function exportEnvironment(
  vaultId: string,
  envId: string,
  headRevision: number,
  format: "env" | "json"
): Promise<string> {
  const snapshot = await loadSnapshot(vaultId, envId, headRevision);
  const entries = snapshot.keys.map((key) => ({ name: key.name, value: key.value }));
  const content = format === "env" ? serializeDotenv(entries) : serializeJson(entries);
  // Audit is best-effort metadata; a failure must not block the local export.
  await api.auditExport(vaultId, { environmentId: envId, format }).catch(() => {});
  return content;
}

// ————— membership (E3) —————

export interface InvitePreview {
  exists: boolean;
  fingerprint?: string;
  publicKey?: string;
}

/** Look up the invitee before inviting; fingerprint shown for verification (T9). */
export async function previewInvitee(email: string): Promise<InvitePreview> {
  try {
    const { publicKey } = await api.publicKey(email);
    return { exists: true, publicKey, fingerprint: await publicKeyFingerprint(publicKey) };
  } catch {
    return { exists: false };
  }
}

export async function invite(
  vaultId: string,
  email: string,
  role: "owner" | "member"
): Promise<{ flow: "A" | "B" }> {
  const preview = await previewInvitee(email);
  if (!preview.exists) {
    await api.createInvitation(vaultId, { inviteeEmail: email, role }); // Flow B: deferred wrap
    return { flow: "B" };
  }
  const detail = await api.vaultDetail(vaultId);
  const vaultKey = await unwrapForGeneration(detail, detail.vault.keyGeneration);
  const envelope = await wrapVaultKey(vaultKey, await b64.from(preview.publicKey!));
  await api.createInvitation(vaultId, { inviteeEmail: email, role, envelope });
  return { flow: "A" };
}

/** Owner's deferred wraps (Flow B step 3): wrap for accepted invitees. */
export async function completePendingWraps(vaultId: string): Promise<number> {
  const { invitations } = await api.listVaultInvitations(vaultId);
  const awaiting = invitations.filter((i) => i.state === "accepted" && !i.envelope);
  if (awaiting.length === 0) return 0;
  const detail = await api.vaultDetail(vaultId);
  const vaultKey = await unwrapForGeneration(detail, detail.vault.keyGeneration);
  for (const invitation of awaiting) {
    const { publicKey } = await api.publicKey(invitation.inviteeEmail!);
    const envelope = await wrapVaultKey(vaultKey, await b64.from(publicKey));
    await api.activateInvitation(invitation.id, { envelope });
  }
  return awaiting.length;
}

/** Member removal = full client-side key rotation (revocation-protocol §3). */
export async function removeMember(vaultId: string, removedUserId: string): Promise<void> {
  const detail = await api.vaultDetail(vaultId);
  const oldGeneration = detail.vault.keyGeneration;
  const oldKey = await unwrapForGeneration(detail, oldGeneration);
  const newKey = await generateVaultKey();
  const newGeneration = oldGeneration + 1;

  const { members } = await api.members(vaultId);
  const remaining = members.filter((m) => m.userId !== removedUserId);
  const newEnvelopes = await Promise.all(
    remaining.map(async (member) => ({
      userId: member.userId,
      envelope: await wrapVaultKey(newKey, await b64.from(member.publicKey)),
    }))
  );

  const newVaultNameEnv = await encryptName(
    await decryptName(detail.vault.nameEnv, oldKey, aadVaultName(vaultId)),
    newKey,
    vaultKid(vaultId, newGeneration),
    aadVaultName(vaultId)
  );

  const newRevisions = await Promise.all(
    detail.environments.map(async (environment) => {
      const head = environment.headRevision;
      let snapshot = emptySnapshot();
      if (head > 0) {
        const { revision } = await api.getRevision(vaultId, environment.id, head);
        const key = await unwrapForGeneration(detail, revision.keyGeneration);
        snapshot = await decryptSnapshot(revision.snapshotEnv, key, {
          vaultId,
          envId: environment.id,
          revision: head,
          generation: revision.keyGeneration,
        });
      }
      const location = { vaultId, envId: environment.id, revision: head + 1, generation: newGeneration };
      return {
        environmentId: environment.id,
        baseRevision: head,
        snapshotEnv: await encryptSnapshot(snapshot, newKey, location),
        diffEnv: await encryptDiff(diffSnapshots(snapshot, snapshot), newKey, location),
        nameEnv: await encryptName(
          await decryptName(environment.nameEnv, oldKey, aadEnvName(vaultId, environment.id)),
          newKey,
          vaultKid(vaultId, newGeneration),
          aadEnvName(vaultId, environment.id)
        ),
      };
    })
  );

  const { files } = await api.listFiles(vaultId);
  const fileRewrites = await Promise.all(
    files.map(async (file) => {
      const oldFileKey = await unwrapForGeneration(detail, file.keyGeneration);
      const plain = await decryptFileContent(vaultId, file.id, file.streamEnv, oldFileKey);
      const { chunks, streamEnv } = await encryptFileContent(plain, newKey, vaultId, newGeneration);
      return { fileId: file.id, streamEnv, chunks: await Promise.all(chunks.map(b64.to)) };
    })
  );

  await api.rotate(vaultId, {
    baseGeneration: oldGeneration,
    removedUserId,
    newVaultNameEnv,
    newEnvelopes,
    newRevisions,
    fileRewrites,
  });
  cacheVaultKey(vaultId, newGeneration, newKey);
}

// ————— files (E5) —————

const CHUNK_BYTES = 4 * 1024 * 1024;

async function encryptFileContent(
  data: Uint8Array,
  vaultKey: Uint8Array,
  vaultId: string,
  generation: number
): Promise<{ chunks: Uint8Array[]; streamEnv: unknown }> {
  const stream = await createFileEncryptStream(vaultKey, { vaultId, generation }, CHUNK_BYTES);
  const chunks: Uint8Array[] = [];
  const total = Math.max(1, Math.ceil(data.length / CHUNK_BYTES));
  for (let i = 0; i < total; i++) {
    const slice = data.subarray(i * CHUNK_BYTES, Math.min((i + 1) * CHUNK_BYTES, data.length));
    chunks.push(await stream.push(slice, i === total - 1));
  }
  return { chunks, streamEnv: stream.envelope };
}

async function decryptFileContent(
  vaultId: string,
  fileId: string,
  streamEnv: unknown,
  vaultKey: Uint8Array
): Promise<Uint8Array> {
  const stream = await createFileDecryptStream(vaultKey, streamEnv);
  const parts: Uint8Array[] = [];
  for (let idx = 0; ; idx++) {
    const chunk = await api.fileChunk(vaultId, fileId, idx);
    const { data, final } = await stream.pull(chunk);
    parts.push(data);
    if (final) break;
  }
  if (!stream.finished()) throw new Error("file truncated");
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function uploadFile(vaultId: string, file: File): Promise<string> {
  const detail = await api.vaultDetail(vaultId);
  const generation = detail.vault.keyGeneration;
  const vaultKey = await unwrapForGeneration(detail, generation);
  const fileId = crypto.randomUUID();
  const nameEnv = await encryptName(
    file.name,
    vaultKey,
    vaultKid(vaultId, generation),
    aadFileName(vaultId, fileId)
  );
  const data = new Uint8Array(await file.arrayBuffer());
  const { chunks, streamEnv } = await encryptFileContent(data, vaultKey, vaultId, generation);
  await api.createFile(vaultId, {
    fileId,
    nameEnv,
    streamEnv,
    keyGeneration: generation,
    chunks: await Promise.all(chunks.map(b64.to)),
  });
  return fileId;
}

export async function decryptFileName(
  vaultId: string,
  file: { id: string; nameEnv: unknown; keyGeneration: number }
): Promise<string> {
  const detail = await api.vaultDetail(vaultId);
  const vaultKey = await unwrapForGeneration(detail, file.keyGeneration);
  return decryptName(file.nameEnv, vaultKey, aadFileName(vaultId, file.id));
}

/** Download + decrypt to a Blob for a save dialog. Plaintext exists only in
 *  this function's scope and the returned Blob the user chose to create. */
export async function downloadFile(
  vaultId: string,
  file: { id: string; nameEnv: unknown; streamEnv: unknown; keyGeneration: number }
): Promise<{ name: string; blob: Blob }> {
  const detail = await api.vaultDetail(vaultId);
  const vaultKey = await unwrapForGeneration(detail, file.keyGeneration);
  const name = await decryptName(file.nameEnv, vaultKey, aadFileName(vaultId, file.id));
  const data = await decryptFileContent(vaultId, file.id, file.streamEnv, vaultKey);
  return { name, blob: new Blob([data as BlobPart], { type: "application/octet-stream" }) };
}
