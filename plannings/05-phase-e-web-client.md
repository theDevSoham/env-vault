# 05 — Phase E: Web Client

**Status: DONE (2026-07-23)** — see [worklog/phase-e-web-client__worklog_2026-07-23.md](../worklog/phase-e-web-client__worklog_2026-07-23.md)

**Goal:** client-side cryptographic layer + UI (handoff §35 Phase E). All decryption in memory, no reveal UI, strict XSS posture.

**Dependencies:** Phase B (crypto module), Phase D (APIs). **Blocks:** F, G.

## Steps

### E1. Client key/session layer
- [x] `src/lib/client/keystore.ts`: key material in module-scope variables (deliberately outside React state — cannot be serialized by devtools/persistence); React sees only non-secret facts via `useSyncExternalStore`; `lock()` zeroizes.
- [x] Unlock flow: `UnlockGate` wraps every authenticated page — reload wipes keys, password re-derives (verified in browser).
- [x] Typed API client `src/lib/api/client.ts` — the only network path; `RevisionConflict` carries `currentHead`.

### E2. Auth screens
- [x] Signup: client-side identity generation; **no-recovery warning + explicit acknowledgement checkbox** (threat-model L1); auto-login.
- [x] Login (kdf → derive → authKey) + unlock; logout.
- [x] Password change flow in `flows.ts` (`changePassword`) — UI entry point deferred to a settings screen (follow-up).

### E3. Vault & environment UI
- [x] Vault list (names decrypted client-side) / create / delete. Creation generates vault key + wraps for owner client-side; **client-generated UUIDs** for vaults/environments/files so AAD bindings exist pre-creation (backend + schemas updated).
- [x] Environments: create (owner), list, open; default-name suggestion in UI copy.
- [x] Members panel: fingerprints shown for every member and invitee (T9 — `publicKeyFingerprint` added to crypto module); invite Flow A (wrap now) and Flow B (deferred — "approve & grant access" button for accepted invitees); remove member runs the **full client-side rotation** (re-encrypt snapshots, names, files; re-wrap remaining members).
- [x] Pending-invitations inbox on the vaults page (vault names stay hidden pre-membership, per ADR-004).

### E4. Secrets editor (the core screen)
- [x] Key names visible after decryption; **values never rendered** — write-only password inputs, no reveal control anywhere (handoff §7).
- [x] Staged changeset: add/edit/rename/delete locally; one commit = one revision; stable key ids preserved for exact rename detection.
- [x] Commit with base revision; 409 conflict → reload latest + notice to re-apply (handoff §30).
- [x] `.env` import: parsed locally (`envformat.ts`, unit-tested incl. quoting/escapes round-trip), staged as changeset.
- [x] History list with client-decrypted structural diffs (names only). Full compare/restore = Phase F.

### E5. Secret files UI
- [x] Upload: client-side secretstream encryption, 4 MiB chunks, encrypted filename.
- [x] Download: chunk fetch + stream decrypt + Blob save; truncation detected via FINAL tag.

### E6. Hardening (threat-model T8)
- [x] `proxy.ts` (Next 16 middleware successor, per bundled docs): nonce + `strict-dynamic` CSP, `wasm-unsafe-eval` for libsodium, `unsafe-eval` dev-only; plus nosniff, no-referrer, frame-ancestors 'none', permissions-policy.
- [x] Documented exception: `style-src 'unsafe-inline'` (Next/Tailwind inject un-nonced style tags; script-src stays strict) — revisit Phase H.
- [x] Zero third-party scripts/origins; `connect-src 'self'`; dropped Google-font loader from scaffold; no new client deps beyond libsodium.
- [x] No `dangerouslySetInnerHTML` anywhere (grep-clean); react-hooks `set-state-in-effect` disabled with written rationale (no fetching library = less third-party code on key-material pages).

## Exit criteria

- [x] MVP criteria #1–#10 verified **in a real browser**: signup (64 MiB Argon2id in wasm) → vault create → environment → stage 2 secrets → commit revision 1 → history shows `+ DATABASE_URL + JWT_SECRET` with values concealed → reload → UnlockGate → unlock → vault list decrypts.
- [x] Browser storage audit during the journey: localStorage empty, no IndexedDB, session cookie invisible to JS (HttpOnly), no plaintext secret in the DOM post-commit.
- [x] CSP + security headers verified live via curl on a page response.
- [x] Suite: 84 tests green; tsc/lint/build clean.
- [x] Worklog entry written.
