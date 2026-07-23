/**
 * AAD builders (crypto-spec §5–§7).
 *
 * Every record ciphertext is bound to its logical location so a compromised
 * database cannot transplant envelopes between vaults/environments/revisions
 * undetected (threat-model T1/T3). Application code must always use these
 * builders — never hand-write AAD strings.
 */

export function aadSnapshot(vaultId: string, envId: string, revision: number): string {
  return `snap:${vaultId}:${envId}:${revision}`;
}

export function aadDiff(vaultId: string, envId: string, revision: number): string {
  return `diff:${vaultId}:${envId}:${revision}`;
}

export function aadVaultName(vaultId: string): string {
  return `vname:${vaultId}`;
}

export function aadEnvName(vaultId: string, envId: string): string {
  return `ename:${vaultId}:${envId}`;
}

export function aadFileName(vaultId: string, fileId: string): string {
  return `fname:${vaultId}:${fileId}`;
}

/** identifier = the user's lowercased email (V1): the userId does not exist yet
 *  at signup time, when the private key is first encrypted client-side. An
 *  email-change feature would require re-encrypting the private key. */
export function aadPrivateKey(identifier: string): string {
  return `privkey:${identifier}`;
}

/** kid for vault-key-encrypted records: "<vault-id>:<generation>" (crypto-spec §2.1). */
export function vaultKid(vaultId: string, generation: number): string {
  return `${vaultId}:${generation}`;
}

/** kid for the user's KEK-encrypted private key: "kek:<user-id>". */
export function kekKid(userId: string): string {
  return `kek:${userId}`;
}
