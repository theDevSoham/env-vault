# Phase D — Backend APIs · Worklog · 2026-07-23

**Plan:** [plannings/04-phase-d-backend.md](../plannings/04-phase-d-backend.md) (D1–D5 complete)

## What was done

Built the complete backend: authentication (derived-authKey verification, DB-backed cookie sessions), the central vault authorization guard, and 25 route handlers under `app/api/` — all ciphertext-in/ciphertext-out. 12 API integration tests exercise the authorization matrix by invoking handlers directly against the dev database. Whole suite now 81 tests.

## Key implementation notes

- **Server framework** in `src/lib/api-server/`: `http.ts` (json/readJson with size caps, `withRoute` error-mapper), `sessions.ts`, `guard.ts`, `ratelimit.ts` (in-memory sliding window), `validate.ts` (zod + crypto envelope assertions), `dummykdf.ts` (T10 anti-enumeration), `codec.ts` (base64url chunk transport).
- **Server-side credential hashing lives in the crypto module** (`src/lib/crypto/authhash.ts`): `hashAuthKey`/`verifyAuthKey` (Argon2id `crypto_pwhash_str`), session-token generate/hash (BLAKE2b), `keyedHash32` — preserving the "only the crypto module touches primitives" rule (isolation test still green).
- **Sessions**: `sessions` table (migration `0002_sessions`), token hash only in DB, 7-day TTL, HttpOnly/SameSite=Lax cookie, Secure in production. Password change destroys all sessions atomically after the credential swap.
- **Authorization semantics**: non-members receive **404** (vault existence hidden), members performing owner actions receive **403**. Role split per handoff §6 (files: owner manages, member reads).
- **Anti-enumeration**: `/api/auth/kdf` returns deterministic dummy params (keyed BLAKE2b of email under `SERVER_SECRET`, new env var in `.env`/`.env.example`); login failure is uniform 401 for unknown-email vs wrong-key (tested byte-equal responses).
- **Next 16 conventions verified** against `node_modules/next/dist/docs` before writing routes (`params` is a Promise; handlers are plain `(Request, ctx)` functions — which is what makes them directly testable in vitest).
- Body caps: 1 MiB default, 64 MiB for revisions/files/rotation. Envelope shape validation happens at the schema layer (422) before any DB touch.

## Verification

- 81/81 tests (53 crypto, 16 db, 12 api). API tests cover: kdf known-vs-unknown shape equality; uniform login failure; session lifecycle incl. logout; /me exposes no verifier; vault+env+revision creation; anonymous 401 sweep; non-member 404 sweep incl. delete attempt; invitation theft 404; member read + commit vs owner-only 403s; 409 + currentHead; member-rotation 403; owner rotation end-to-end (member locked out afterward); 422 invalid envelope; audit completeness + no-ciphertext check.
- `tsc --noEmit`, `npm run lint`, `npm run build` (25 ƒ routes) all clean.
- Logging grep: exactly one console call in production code — `withRoute`'s method/path/status line on 5xx.

## Files touched

Created: `src/lib/api-server/` (8 modules + integration test), `src/lib/crypto/authhash.ts`, `app/api/**` (25 route files), `drizzle/0002_sessions.sql`.
Updated: `src/lib/db/schema.ts` (+sessions), `src/lib/db/invitations.ts` (+listInvitationsForEmail/ForVault), `src/lib/db/index.ts`, `src/lib/crypto/index.ts`, `vitest.config.ts` (@/ alias), `.env`/`.env.example` (+SERVER_SECRET), `package.json` (+zod), AGENTS.md (<150-line rule added per user), plannings.

## Follow-ups

- Rate limiter is in-memory — fine for single-instance V1; multi-instance needs a shared store (revisit at deploy time).
- `server-only` import guard for `src/lib/db`/`api-server` deferred: it breaks direct handler invocation in vitest; revisit in Phase H (Next's server/client boundary already prevents client bundling of route code).
- CSP headers + security headers belong to Phase E (E6).
- Phase E next: client crypto layer (`src/lib/api/` typed client, in-memory key store) + UI.
