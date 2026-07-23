# 04 — Phase D: Backend APIs

**Status: DONE (2026-07-23)** — see [worklog/phase-d-backend-apis__worklog_2026-07-23.md](../worklog/phase-d-backend-apis__worklog_2026-07-23.md)

**Goal:** authorization + encrypted-storage APIs (handoff §35 Phase D). The backend coordinates and stores; it never decrypts, never generates exports, never logs secret-carrying payloads.

**Dependencies:** Phase C. **Blocks:** E.

## Steps

### D1. Authentication (per ADR-002)
- [x] Signup: stores email, Argon2id-stretched authKey verifier (`hashAuthKey` in the crypto module), public key, encrypted private key, KDF params — nothing else. Auto-login on signup.
- [x] Login: uniform 401 for unknown-email vs wrong-key; DB-backed sessions (`sessions` table, migration 0002) storing only a BLAKE2b token hash; HttpOnly/SameSite=Lax cookie (Secure in production).
- [x] Pre-login KDF lookup with deterministic dummy params for unknown emails (T10; `SERVER_SECRET` env).
- [x] Change-password: old-key verification → atomic verifier/params/encPrivKey swap → all sessions invalidated, fresh session issued.
- [x] `requireSession` helper; consistent 401s.

### D2. Authorization layer
- [x] Central guard (`src/lib/api-server/guard.ts`): `requireVaultMember` (404 for non-members — vault existence hidden) / `requireVaultOwner` (403 for members).
- [x] Owner-only: vault delete, environments manage, invitations manage, rotation, file manage. Member: read vault/files/audit, commit revisions, export.
- [x] Authorization matrix test: anonymous → 401, non-member → 404, member-vs-owner → 403 splits, cross-account invitation theft → 404.

### D3. Core endpoints (25 routes under `app/api/`, all payloads ciphertext envelopes)
- [x] Vaults: list, create (accepts owner enc.box), detail bundle (vault + role + environments + my envelopes), delete.
- [x] Environments: create, delete (with vault-scope IDOR check).
- [x] Revisions: commit (base-revision check → 409 + `currentHead`), list (metadata + diff envelope), get by number.
- [x] Secret files: upload/replace/delete (owner), metadata + binary chunk download (member); base64url chunk transport; 64 MiB body cap.
- [x] Invitations: create (Flow A envelope now / Flow B deferred), my-pending list (invitee view shows inviter/role only — names are encrypted), accept (email-bound, single-use), revoke, activate (owner wrap).
- [x] Members list; public-key lookup by email (authenticated + rate-limited, for wrapping; fingerprint display is Phase E).
- [x] Key rotation: atomic commit endpoint delegating to the Phase C transaction; owner-only.
- [x] Request validation: zod schemas + crypto-module envelope assertions (422 before touching the DB).

### D4. Audit logging
- [x] Events appended by repos for every handoff §27 action; export_requested endpoint records format+environment metadata.
- [x] Audit read endpoint (members); test asserts no ciphertext blobs appear in events.

### D5. Logging & error hygiene
- [x] `withRoute` wrapper: typed-error → status mapping; logs method/path/status on 5xx only; **no body/header logging anywhere** (grep-verified: single console call in the codebase, in the wrapper).
- [x] Error responses are generic codes; no payload echoes.
- [x] Rate limiting on signup/login/kdf/change-password/public-key (in-memory sliding window; multi-instance deployment needs a shared store — documented follow-up, not silent).

## Exit criteria

- [x] Integration tests: 12 API tests invoking route handlers directly against the dev DB — full authorization matrix + auth lifecycle + rotation end-to-end + 409 conflict shape + 422 envelope rejection.
- [x] Concurrency: stale-base commit → 409 with `currentHead` (API level); transactional guarantees covered by Phase C tests (rollback, serialization).
- [x] Logging review: grep sweep clean.
- [x] Whole suite: 81 tests green; `tsc`, lint, `next build` (25 routes) clean.
- [x] Worklog entry written.
