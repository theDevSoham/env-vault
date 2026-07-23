# Phase E — Web Client · Worklog · 2026-07-23

**Plan:** [plannings/05-phase-e-web-client.md](../plannings/05-phase-e-web-client.md) (E1–E6 complete)

## What was done

Built the full web client: in-memory key store, typed API client, client-side protocol flows (signup/login/unlock, vault + environment creation, staged-changeset commits, invitations both flows, member-removal rotation, encrypted file up/download), five UI pages + four components, and CSP hardening via Next 16's `proxy.ts`. Verified the complete MVP journey in a real browser.

## Design decisions & discoveries

- **Client-generated UUIDs**: AAD bindings (`vname:<vaultId>`, `ename:…`, `fname:…`, `privkey:<id>`) require ids to exist before encryption, but the server assigned ids at creation. Resolution: clients generate UUIDs for vaults/environments/files (schemas + repos + routes updated); the **private-key AAD uses the lowercased email** (userId doesn't exist at signup) — documented in `aad.ts`; email change would require private-key re-encryption.
- **Key material lives outside React state** (`keystore.ts` module scope): can't be serialized by devtools/error reporters; `useSyncExternalStore` exposes only non-secret session facts; `lock()` zeroizes buffers.
- **`publicKeyFingerprint`** added to the crypto module (BLAKE2b-64 → `XXXX-XXXX-XXXX-XXXX`), rendered for members and invitees (T9 mitigation).
- **Next 16 facts** (from bundled docs, per AGENTS rule): middleware is renamed `proxy.ts`; CSP guide's nonce + `strict-dynamic` pattern followed, plus `wasm-unsafe-eval` (libsodium) and dev-only `unsafe-eval`.
- **Documented CSP exception**: `style-src 'unsafe-inline'` (un-nonced style injection by Next/Tailwind; script-src remains strict). Revisit Phase H.
- **Lint rule disabled with rationale**: `react-hooks/set-state-in-effect` rejects effect-based fetching entirely; its remedy (a data-fetching library) conflicts with E6's third-party-code minimization on key-material pages. Recorded in `eslint.config.mjs`.

## Verification

- **Browser journey** (dev server + browser pane): signup with real 64 MiB Argon2id in wasm → auto-login → create vault "Acme Project" (name encrypted; decrypts in list) → create "Development" → stage `DATABASE_URL` + `JWT_SECRET` via write-only inputs → commit → history renders decrypted diff `+ DATABASE_URL + JWT_SECRET`, values nowhere in DOM → hard reload wipes keys → UnlockGate → password unlock → vault list decrypts again.
- **Storage audit mid-journey**: `localStorage` empty, `sessionStorage` only Next dev channels, zero IndexedDB databases, `document.cookie` empty (HttpOnly), no plaintext secret substrings in DOM.
- **Headers verified via curl**: full CSP (nonce present), nosniff, no-referrer, permissions-policy, frame-ancestors 'none'.
- Suite: 84 tests green (added envformat round-trip tests); `tsc`, lint, `next build` clean.

## Files touched

Created: `src/lib/api/client.ts`, `src/lib/client/` (keystore, flows, envformat + test), `src/lib/crypto/fingerprint.ts`, `src/components/` (UnlockGate, useSession, MembersPanel, FilesPanel, SecretsEditor), `app/` pages (landing, signup, login, vaults, vault detail, environment), `proxy.ts`, `.claude/launch.json`.
Updated: `app/layout.tsx`/`globals.css` (scaffold replaced, fonts dropped), backend id-passthrough (schemas/repos/routes for client UUIDs), `listActiveMembers` (+email/publicKey join), `aad.ts` (identifier semantics), `eslint.config.mjs`, both test suites for new signatures, `AGENTS.md` map.

## Follow-ups

- Password-change + account-settings UI screen (flow exists in `flows.ts`; no UI entry yet).
- `flows.ts` re-fetches vault detail per operation — fine at V1 scale; cache if it ever chats too much.
- Owner "approve & grant access" is manual; consider surfacing pending wraps as a badge/notification.
- Phase F (compare/restore/conflict UX polish) and Phase G (export UI — serializers already written and tested in `envformat.ts`).
