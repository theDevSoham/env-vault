/**
 * Typed client for the Env Vault backend (plannings/05 E1). The ONLY network
 * path in the web client. Everything sent through here is ciphertext envelopes
 * or non-secret metadata — plaintext never enters a request body by
 * construction (callers get envelopes from src/lib/crypto).
 */

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(`${status}:${code}`);
    this.name = "ApiClientError";
  }
}

export class RevisionConflict extends ApiClientError {
  constructor(public readonly currentHead: number) {
    super(409, "revision_conflict");
  }
}

/**
 * Turn any thrown error into a human-readable message plus a dev-friendly
 * technical detail (HTTP status + error code) for the UI. Used by auth screens
 * so users see specific, actionable messages instead of a generic toast.
 */
export function humanizeApiError(
  error: unknown,
  context: "signup" | "login" | "generic" = "generic"
): { message: string; detail?: string } {
  if (error instanceof ApiClientError) {
    const detail = `${error.status} · ${error.code}`;
    const messages: Record<string, string> = {
      email_taken: "An account with this email already exists — try signing in instead.",
      unauthorized:
        context === "login"
          ? "Incorrect email or password. Your password is case-sensitive."
          : "You're not authorized to do that.",
      invalid_body:
        "Some fields didn't pass validation — check your email and that your password is at least 10 characters.",
      invalid_email: "That doesn't look like a valid email address.",
      invalid_json: "The request was malformed. Please try again.",
      rate_limited: "Too many attempts. Please wait about a minute and try again.",
      body_too_large: "That request was too large.",
      internal:
        "The server hit an unexpected error. If this persists, its database or environment may be misconfigured.",
    };
    if (messages[error.code]) return { message: messages[error.code], detail };
    if (error.status >= 500)
      return { message: "The server hit an error. Please try again shortly.", detail };
    if (error.status === 0)
      return { message: "Couldn't reach the server. Check your connection.", detail };
    return { message: `Request failed (${error.status}).`, detail };
  }
  // Native fetch throws TypeError on network/DNS/CORS failure.
  if (error instanceof TypeError) {
    return { message: "Couldn't reach the server. Check your internet connection and try again." };
  }
  return { message: error instanceof Error ? error.message : "Something went wrong." };
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let code = "error";
    let currentHead: number | undefined;
    try {
      const data = (await response.json()) as { error?: string; currentHead?: number };
      code = data.error ?? code;
      currentHead = data.currentHead;
    } catch {
      /* non-JSON error body */
    }
    if (response.status === 409 && code === "revision_conflict" && currentHead !== undefined) {
      throw new RevisionConflict(currentHead);
    }
    throw new ApiClientError(response.status, code);
  }
  return (await response.json()) as T;
}

export interface KdfParamsDto {
  v: number;
  alg: string;
  salt: string;
  ops: number;
  mem: number;
  outLen: number;
}
export interface MeDto {
  userId: string;
  email: string;
  publicKey: string;
  encPrivKeyEnv: unknown;
  kdfParams: KdfParamsDto;
}
export interface VaultListItem {
  vaultId: string;
  nameEnv: unknown;
  keyGeneration: number;
  role: string;
}
export interface EnvironmentDto {
  id: string;
  vaultId: string;
  nameEnv: unknown;
  headRevision: number;
}
export interface EnvelopeRow {
  generation: number;
  envelope: unknown;
}
export interface VaultDetailDto {
  vault: { id: string; nameEnv: unknown; keyGeneration: number };
  role: "owner" | "member";
  environments: EnvironmentDto[];
  envelopes: EnvelopeRow[];
}
export interface RevisionMetaDto {
  id: string;
  number: number;
  actorUserId: string | null;
  keyGeneration: number;
  message: string | null;
  diffEnv: unknown;
  createdAt: string;
}
export interface RevisionDto extends RevisionMetaDto {
  snapshotEnv: unknown;
}
export interface MemberDto {
  userId: string;
  role: string;
  email: string;
  publicKey: string;
  isService: boolean;
  expiresAt: string | null;
}
export interface ServiceAccountDto {
  userId: string;
  name: string;
  publicKey: string;
  membershipExpiresAt: string | null;
  tokenExpiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}
export interface InvitationDto {
  id: string;
  inviteeEmail?: string;
  role: string;
  state: string;
  envelope?: unknown;
  expiresAt: string;
}
export interface FileDto {
  id: string;
  nameEnv: unknown;
  streamEnv: unknown;
  sizeBytes: number;
  keyGeneration: number;
}
export interface AuditEventDto {
  id: number;
  actorUserId: string | null;
  type: string;
  context: Record<string, unknown>;
  createdAt: string;
}

export const api = {
  // auth
  kdf: (email: string) =>
    call<{ kdfParams: KdfParamsDto }>("GET", `/api/auth/kdf?email=${encodeURIComponent(email)}`),
  signup: (body: unknown) => call<{ userId: string }>("POST", "/api/auth/signup", body),
  login: (body: unknown) => call<{ userId: string }>("POST", "/api/auth/login", body),
  logout: () => call<{ ok: true }>("POST", "/api/auth/logout"),
  changePassword: (body: unknown) => call<{ ok: true }>("POST", "/api/auth/change-password", body),
  me: () => call<MeDto>("GET", "/api/me"),
  publicKey: (email: string) =>
    call<{ userId: string; publicKey: string }>(
      "GET",
      `/api/users/public-key?email=${encodeURIComponent(email)}`
    ),
  // vaults
  listVaults: () => call<{ vaults: VaultListItem[] }>("GET", "/api/vaults"),
  createVault: (body: unknown) => call<{ vaultId: string }>("POST", "/api/vaults", body),
  vaultDetail: (vaultId: string) => call<VaultDetailDto>("GET", `/api/vaults/${vaultId}`),
  deleteVault: (vaultId: string) => call<{ ok: true }>("DELETE", `/api/vaults/${vaultId}`),
  members: (vaultId: string) => call<{ members: MemberDto[] }>("GET", `/api/vaults/${vaultId}/members`),
  rotate: (vaultId: string, body: unknown) =>
    call<{ ok: true }>("POST", `/api/vaults/${vaultId}/rotate`, body),
  // environments + revisions
  createEnvironment: (vaultId: string, body: unknown) =>
    call<{ environmentId: string }>("POST", `/api/vaults/${vaultId}/environments`, body),
  deleteEnvironment: (vaultId: string, envId: string) =>
    call<{ ok: true }>("DELETE", `/api/vaults/${vaultId}/environments/${envId}`),
  listRevisions: (vaultId: string, envId: string) =>
    call<{ revisions: RevisionMetaDto[] }>(
      "GET",
      `/api/vaults/${vaultId}/environments/${envId}/revisions`
    ),
  getRevision: (vaultId: string, envId: string, number: number) =>
    call<{ revision: RevisionDto }>(
      "GET",
      `/api/vaults/${vaultId}/environments/${envId}/revisions/${number}`
    ),
  commitRevision: (vaultId: string, envId: string, body: unknown) =>
    call<{ number: number }>("POST", `/api/vaults/${vaultId}/environments/${envId}/revisions`, body),
  // invitations
  listVaultInvitations: (vaultId: string) =>
    call<{ invitations: InvitationDto[] }>("GET", `/api/vaults/${vaultId}/invitations`),
  createInvitation: (vaultId: string, body: unknown) =>
    call<{ invitationId: string }>("POST", `/api/vaults/${vaultId}/invitations`, body),
  myInvitations: () => call<{ invitations: InvitationDto[] }>("GET", "/api/invitations"),
  acceptInvitation: (id: string) => call<{ state: string }>("POST", `/api/invitations/${id}/accept`),
  revokeInvitation: (id: string) => call<{ ok: true }>("POST", `/api/invitations/${id}/revoke`),
  activateInvitation: (id: string, body: unknown) =>
    call<{ ok: true }>("POST", `/api/invitations/${id}/activate`, body),
  // files
  listFiles: (vaultId: string) => call<{ files: FileDto[] }>("GET", `/api/vaults/${vaultId}/files`),
  createFile: (vaultId: string, body: unknown) =>
    call<{ fileId: string }>("POST", `/api/vaults/${vaultId}/files`, body),
  deleteFile: (vaultId: string, fileId: string) =>
    call<{ ok: true }>("DELETE", `/api/vaults/${vaultId}/files/${fileId}`),
  fileChunk: async (vaultId: string, fileId: string, idx: number): Promise<Uint8Array> => {
    const response = await fetch(`/api/vaults/${vaultId}/files/${fileId}/chunks/${idx}`);
    if (!response.ok) throw new ApiClientError(response.status, "chunk_fetch_failed");
    return new Uint8Array(await response.arrayBuffer());
  },
  // service accounts + temporary access (Phase 2)
  listServiceAccounts: (vaultId: string) =>
    call<{ serviceAccounts: ServiceAccountDto[] }>("GET", `/api/vaults/${vaultId}/service-accounts`),
  createServiceAccount: (vaultId: string, body: unknown) =>
    call<{ serviceAccountId: string; token: string }>(
      "POST",
      `/api/vaults/${vaultId}/service-accounts`,
      body
    ),
  revokeServiceAccount: (vaultId: string, saUserId: string) =>
    call<{ ok: true }>("POST", `/api/vaults/${vaultId}/service-accounts/${saUserId}/revoke`),
  setMemberExpiry: (vaultId: string, memberUserId: string, body: unknown) =>
    call<{ ok: true }>("POST", `/api/vaults/${vaultId}/members/${memberUserId}/expiry`, body),
  // devices (CLI grants)
  pendingDevice: (code: string) =>
    call<{ deviceId: string; name: string; devicePubKey: string }>(
      "GET",
      `/api/devices/pending?code=${encodeURIComponent(code)}`
    ),
  approveDevice: (deviceId: string, body: unknown) =>
    call<{ ok: true }>("POST", `/api/devices/${deviceId}/approve`, body),
  denyDevice: (deviceId: string) => call<{ ok: true }>("POST", `/api/devices/${deviceId}/deny`),
  listDevices: () =>
    call<{ devices: { id: string; name: string; createdAt: string; lastUsedAt: string | null; devicePubKey: string }[] }>(
      "GET",
      "/api/devices"
    ),
  revokeDevice: (deviceId: string) => call<{ ok: true }>("POST", `/api/devices/${deviceId}/revoke`),
  // audit
  audit: (vaultId: string) => call<{ events: AuditEventDto[] }>("GET", `/api/vaults/${vaultId}/audit`),
  auditExport: (vaultId: string, body: unknown) =>
    call<{ ok: true }>("POST", `/api/vaults/${vaultId}/audit/export`, body),
};
