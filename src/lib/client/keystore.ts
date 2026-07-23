"use client";

/**
 * In-memory key store (plannings/05 E1, handoff §26).
 *
 * Key material (private key, unwrapped vault keys) lives in module-scope
 * variables — deliberately OUTSIDE React state so it can never be serialized
 * by devtools, error reporters, or persistence layers. React components see
 * only non-secret session facts via useSyncExternalStore. Nothing here ever
 * touches localStorage/sessionStorage/IndexedDB; a page reload wipes all keys
 * and the UI re-prompts for the password (UnlockGate).
 */

export interface SessionState {
  userId: string | null;
  email: string | null;
  publicKey: string | null;
  /** true once the private key has been decrypted into memory */
  unlocked: boolean;
}

let state: SessionState = { userId: null, email: null, publicKey: null, unlocked: false };

// —— secret material: module-private, never exported as state ——
let privateKey: Uint8Array | null = null;
const vaultKeys = new Map<string, Uint8Array>(); // `${vaultId}:${generation}` → key

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSessionState(): SessionState {
  return state;
}

export function setSession(userId: string, email: string, publicKey: string): void {
  state = { userId, email, publicKey, unlocked: state.unlocked };
  emit();
}

export function setUnlocked(key: Uint8Array): void {
  privateKey = key;
  state = { ...state, unlocked: true };
  emit();
}

export function getPrivateKey(): Uint8Array | null {
  return privateKey;
}

export function cacheVaultKey(vaultId: string, generation: number, key: Uint8Array): void {
  vaultKeys.set(`${vaultId}:${generation}`, key);
}

export function getCachedVaultKey(vaultId: string, generation: number): Uint8Array | null {
  return vaultKeys.get(`${vaultId}:${generation}`) ?? null;
}

/** Wipe everything (logout / lock). Best-effort zeroization before release. */
export function lock(): void {
  if (privateKey) privateKey.fill(0);
  privateKey = null;
  for (const key of vaultKeys.values()) key.fill(0);
  vaultKeys.clear();
  state = { ...state, unlocked: false };
  emit();
}

export function clearSession(): void {
  lock();
  state = { userId: null, email: null, publicKey: null, unlocked: false };
  emit();
}
