# 03 — Phase C: Data Model

**Status: DONE (2026-07-23)** — see [worklog/phase-c-data-model__worklog_2026-07-23.md](../worklog/phase-c-data-model__worklog_2026-07-23.md)

**Goal:** design and implement the persistence schema for all entities (handoff §35 Phase C). The database stores only what handoff §3 permits.

**Dependencies:** Phase A (formats), Phase B (envelope shapes are final). **Blocks:** D.

## Steps

### C1. Infrastructure decisions
- [x] Resolve **O3**: Neon Postgres + Drizzle ORM (node-postgres driver) — [ADR-006](../docs/decisions/adr-006-database-orm.md).
- [x] Resolve **O4**: storage adapter interface with Postgres-backed blob store for V1 — [ADR-007](../docs/decisions/adr-007-object-storage.md).
- [x] Dev database: user-provisioned Neon instance; `DATABASE_URL` in `.env` (gitignored, `.env.example` committed); drizzle-kit migrations in `drizzle/`.

### C2. Schema (`src/lib/db/schema.ts`, migrations `0000_init` + `0001_append-only-guards`)
- [x] `users` — email (case-insensitive unique), authVerifier; **no passwords**.
- [x] `user_keys` — public key, KEK-encrypted private key envelope, versioned KDF params.
- [x] `vaults` — encrypted name (ADR-004), key generation.
- [x] `vault_memberships` — role owner/member, status active/removed (CHECK-constrained).
- [x] `vault_key_envelopes` — unique (vault, user, generation); old generations retained.
- [x] `environments` — encrypted name, head revision counter.
- [x] `revisions` — unique (environment, number), key generation, message (500-char cap), snapshot + diff envelopes. *(Handoff's `EncryptedPayload` realized as the two jsonb envelope columns on the revision row.)*
- [x] `secret_files` + `file_chunks` (bytea) — encrypted filename, enc.stream envelope, chunked ciphertext.
- [x] `invitations` — state machine pending/accepted/active/revoked/expired; nullable envelope (Flow B deferred wrap).
- [x] `audit_events` — append-only; deliberately **no FKs** so the immutable log outlives vaults/users (FK SET NULL would be an UPDATE and violate immutability). Same reasoning: `revisions.actor_user_id` has no FK.

### C3. Integrity constraints
- [x] Append-only enforced at the DB level (migration 0001): revisions reject UPDATE and direct DELETE (cascade-originated deletes allowed via `pg_trigger_depth()` — aggregate destruction only); audit_events reject UPDATE and DELETE unconditionally. Repo layer additionally exposes no mutation functions.
- [x] Unique revision numbering per environment + `FOR UPDATE` head lock (handoff §30).
- [x] Cascade rules deliberate: vault/environment deletion destroys the aggregate; audit history survives by design.
- [x] Key-generation columns on envelopes, revisions, and files.

### C4. Data-access layer (`src/lib/db/`)
- [x] Server-only module; app code imports repos, never drizzle directly (`server-only` guard wired in Phase D).
- [x] Typed repo functions: users, vaults/memberships/envelopes, environments, revisions (commit with optimistic concurrency), invitations (both flows), files, audit.
- [x] Atomic key-rotation transaction (`rotation.ts`): base-generation serialization, envelope-set validation (removed member excluded, all remaining covered, every environment covered), per-environment conflict checks, file rewrites, all-or-nothing.

## Exit criteria

- [x] Migrations run cleanly from scratch against Neon (`drizzle-kit migrate`).
- [x] No column can hold plaintext secret material — reviewed against handoff §3; plus an automated schema self-check test asserting every envelope column is jsonb.
- [x] ADRs 006/007 merged; ARCHITECTURE.md §9/§10 updated (no open decisions remain).
- [x] 16 integration tests against the real database: repo flows, revision conflicts (with `currentHead` for rebase), append-only triggers, both invitation flows, rotation (negative + positive + stale-generation), blob-store round-trips, cascade/audit-survival semantics.
- [x] Worklog entry written.
