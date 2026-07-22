# 03 — Phase C: Data Model

**Goal:** design and implement the persistence schema for all entities (handoff §35 Phase C). The database stores only what handoff §3 permits.

**Dependencies:** Phase A (formats), Phase B (envelope shapes are final). **Blocks:** D.

## Steps

### C1. Infrastructure decisions
- [ ] Resolve **O3**: database + ORM (needs transactional multi-row writes for atomic key rotation). Record as ADR.
- [ ] Resolve **O4**: object-storage provider for encrypted files. Record as ADR.
- [ ] Set up local dev database + migration tooling.

### C2. Schema (one migration set, reviewed against handoff §3 allowed-storage list)
- [ ] `User` — id, email, auth identifiers; **no passwords**.
- [ ] `UserKey` — public key, encrypted private key envelope, KDF salt + params (versioned).
- [ ] `Vault` — id, name (plaintext or encrypted per O6 ADR), timestamps.
- [ ] `VaultMembership` — user, vault, role (`owner` / `member`), status.
- [ ] `VaultKeyEnvelope` — vault, member, key generation, wrapped key envelope.
- [ ] `Environment` — vault, name (per O6), current revision number.
- [ ] `Revision` — vault, environment, monotonically increasing number, actor, timestamp, key generation, optional message (**never secret values**), unique `(environment, number)`.
- [ ] `EncryptedPayload` — revision snapshot ciphertext + encrypted structural diff metadata.
- [ ] `SecretFile` — vault, encrypted filename (per §22), object-storage pointer, size, key generation.
- [ ] `Invitation` — vault, invitee email, state (pending/accepted/revoked/expired), expiry.
- [ ] `AuditEvent` — vault, actor, event type (handoff §27 list), timestamp, non-secret context.

### C3. Integrity constraints
- [ ] Append-only enforcement for `Revision` and `AuditEvent` (no UPDATE/DELETE paths in data-access layer).
- [ ] Unique revision numbering per environment (concurrency-safe — supports handoff §30).
- [ ] FK/cascade rules for vault deletion defined deliberately (what is destroyed vs retained).
- [ ] Key-generation columns everywhere ciphertext lives (rotation support).

### C4. Data-access layer
- [ ] `src/lib/db/` server-only module; no raw SQL scattered in routes.
- [ ] Repository functions for every entity with typed inputs/outputs.
- [ ] Transaction helper for atomic key rotation (used in Phase D).

## Exit criteria

- [ ] Migrations run cleanly from scratch; schema matches `docs/` specs.
- [ ] A written check confirms: **no column can ever hold plaintext secret material** (reviewed against handoff §3).
- [ ] ADRs for O3/O4 merged; ARCHITECTURE.md updated.
- [ ] Worklog entry written.
