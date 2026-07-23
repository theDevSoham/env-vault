/**
 * Env Vault data-access layer (Phase C, plannings/03).
 *
 * SERVER-ONLY. The only query surface for the application — route handlers
 * import from here (and src/lib/storage), never from drizzle-orm/pg directly.
 * Append-only tables (revisions, audit_events) expose no update/delete here,
 * and DB triggers (migration 0001) enforce the same at the SQL level.
 */

export { getDb, getPool, closeDb } from "./client";
export type { Db, DbExecutor, DbTransaction } from "./client";
export * as schema from "./schema";
export {
  DbError,
  NotFoundError,
  RevisionConflictError,
  RotationConflictError,
  InvitationStateError,
} from "./errors";
export type { AuditType } from "./audit";
export { appendAudit, listAuditEvents } from "./audit";
export type { CreateUserInput } from "./users";
export {
  createUser,
  getUserByEmail,
  getUserKeys,
  getPublicKey,
  updateUserCredentials,
} from "./users";
export type { CreateVaultInput } from "./vaults";
export {
  createVault,
  getVault,
  getMembership,
  setMembershipExpiry,
  listVaultsForUser,
  listActiveMembers,
  listKeyEnvelopesForMember,
  addKeyEnvelope,
  listEnvironments,
  deleteVault,
} from "./vaults";
export type { CreateServiceAccountInput } from "./serviceaccounts";
export {
  createServiceAccount,
  listServiceAccounts,
  revokeServiceAccount,
} from "./serviceaccounts";
export { createEnvironment, getEnvironment, deleteEnvironment } from "./environments";
export type { CommitRevisionInput } from "./revisions";
export { commitRevision, listRevisions, getRevision } from "./revisions";
export type { RotationCommitInput } from "./rotation";
export { commitKeyRotation } from "./rotation";
export {
  createInvitation,
  getInvitation,
  listAwaitingWrap,
  listInvitationsForEmail,
  listInvitationsForVault,
  acceptInvitation,
  attachEnvelopeAndActivate,
  revokeInvitation,
} from "./invitations";
export {
  createDeviceGrant,
  getPendingGrantByCode,
  approveDeviceGrant,
  denyDeviceGrant,
  getGrantForPoll,
  issueDeviceToken,
  getUserIdForDeviceToken,
  listDeviceGrantsForUser,
  revokeDeviceGrant,
} from "./devices";
export type { CreateFileInput } from "./files";
export {
  createSecretFile,
  replaceSecretFile,
  getSecretFile,
  listSecretFiles,
  deleteSecretFile,
} from "./files";
