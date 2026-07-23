# Phase C — Data Model · Worklog · 2026-07-23

**Plan:** [plannings/03-phase-c-data-model.md](../plannings/03-phase-c-data-model.md) (C1–C4 complete)

## What was done

Resolved the last two open decisions (database + storage), built the full Drizzle schema (11 tables), applied migrations to the user-provisioned Neon Postgres, and implemented the typed data-access layer including the two security-critical transactions (revision commit, key rotation). 16 integration tests run against the real database.

## Decisions made

- **ADR-006 (O3):** Neon Postgres + **Drizzle ORM** with node-postgres. Chosen over Prisma for SQL-level control (append-only triggers, `FOR UPDATE` locks, reviewable SQL migrations) and a lighter runtime in the trust-critical backend. (User delegated the ORM choice.)
- **ADR-007 (O4):** storage adapter interface (`src/lib/storage/`); V1 default is a Postgres-backed blob store (`file_chunks` bytea). S3-compatible adapter is a later drop-in; T2 collapses into T1 for V1.
- **No FKs on `audit_events` (and none on `revisions.actor_user_id`):** discovered during trigger design — `ON DELETE SET NULL` performs an UPDATE on the referenced rows, which would violate the append-only triggers. An immutable log must outlive its referents; ids are stored as plain uuids.
- **Cascade-aware delete guard on `revisions`:** direct DELETE forbidden; deletes originating from FK cascades (environment/vault aggregate destruction) allowed via `pg_trigger_depth() > 1`. Verified by test.
- Handoff's `EncryptedPayload` entity realized as `snapshot_env` + `diff_env` jsonb columns on the revision row (atomic with revision metadata).

## Infrastructure

- `DATABASE_URL` in `.env` (gitignored; `.env.example` added with placeholder; `.gitignore` gained `!.env.example`). TLS pinned `sslmode=verify-full`. `channel_binding` param dropped (unused by node-postgres).
- Migrations: `drizzle/0000_init.sql` (schema), `drizzle/0001_append-only-guards.sql` (trigger functions `forbid_row_mutation` / `forbid_direct_delete`). Applied via `drizzle-kit migrate`.
- **Note for the user:** the connection string was shared in chat, so it exists outside `.env`; rotating the Neon password once setup stabilizes would be prudent.

## Verification

- `npx vitest run`: 69/69 (53 crypto + 16 new DB integration). DB tests cover: case-insensitive email uniqueness; atomic vault creation; revision commit + stale-base conflict carrying `currentHead`; append-only triggers rejecting UPDATE/DELETE (walking Drizzle's error-cause chain); invitation Flow A (immediate activation) and Flow B (deferred wrap, double-activation rejected); rotation — envelope-set validation rejects removed-member envelope with full rollback, successful rotation bumps generation/removes member/re-wraps/appends rotation revision, stale-generation retry rejected; blob-store byte-exact round-trips incl. replace/delete; environment-deletion cascade allowed through the delete guard; vault deletion with audit survival; schema self-check that every envelope column is jsonb.
- `tsc --noEmit` clean; `npm run lint` clean (one stale eslint-disable removed); `npm run build` passes.

## Files touched

Created: `src/lib/db/` (schema, client, errors, audit, users, vaults, environments, revisions, rotation, invitations, files, index), `src/lib/storage/index.ts`, `drizzle/0000_init.sql`, `drizzle/0001_append-only-guards.sql`, `drizzle.config.ts`, `vitest.setup.ts`, `.env` (untracked), `.env.example`, `src/lib/db/__tests__/db.integration.test.ts`.
Updated: `.gitignore`, `vitest.config.ts`, `package.json` (drizzle-orm, pg; dev: drizzle-kit, @types/pg, dotenv), `docs/INDEX.md`, `ARCHITECTURE.md` (D13/D14; open decisions now empty), `plannings/03` (DONE), `plannings/INDEX.md`.

## Follow-ups

- Phase D: wire `server-only` guard into `src/lib/db/client.ts` when route handlers appear; server-side hashing of `authKey` into `authVerifier`; rate limiting.
- Integration tests append audit rows to the dev DB permanently (append-only by design) — harmless; a dev-DB reset is `drizzle-kit drop` + re-migrate if ever wanted.
- drizzle-kit pulled deprecated transitive deps (`@esbuild-kit/*`) — dev-only, note for Phase H dependency review alongside the pre-existing Next postcss/sharp advisories.
