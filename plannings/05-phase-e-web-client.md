# 05 — Phase E: Web Client

**Goal:** client-side cryptographic layer + UI (handoff §35 Phase E). All decryption in memory, no reveal UI, strict XSS posture.

**Dependencies:** Phase B (crypto module), Phase D (APIs). **Blocks:** F, G.

## Steps

### E1. Client key/session layer
- [ ] `src/state/` in-memory key store: PDK-decrypted private key and unwrapped vault keys live only in memory (never localStorage/IndexedDB/cookies — handoff §26).
- [ ] Unlock flow: password → Argon2id → decrypt private key; re-prompt on page reload (document UX tradeoff).
- [ ] Typed API client (`src/lib/api/`) — the only network path; enforces "ciphertext only leaves the browser".

### E2. Auth screens
- [ ] Signup: generate identity client-side (Phase B flows), submit only permitted material.
- [ ] Login + vault unlock.
- [ ] Password change (re-encrypt private key client-side).

### E3. Vault & environment UI
- [ ] Vault list / create / delete (create runs vault-key generation + owner wrap client-side).
- [ ] Environment list / create / delete; defaults Development, Staging, Production + custom names (handoff §5).
- [ ] Members panel: invite (wrap vault key for invitee's public key client-side), pending invitations, remove member → triggers rotation flow (client re-encrypts + re-wraps, commits atomically via D3 endpoint).

### E4. Secrets editor (the core screen)
- [ ] Structural key list — names visible after client decryption, **values never rendered**; no reveal control anywhere (handoff §7).
- [ ] Add/edit/delete/rename keys in a local staged changeset; value input fields are write-only.
- [ ] Commit changeset → one revision (encrypt snapshot + encrypted diff metadata client-side, send with base revision number).
- [ ] Conflict handling: on commit rejection, fetch latest, let user reapply (handoff §30).
- [ ] `.env` import: parse locally, stage as changeset (MVP criterion #4).

### E5. Secret files UI
- [ ] Upload: encrypt client-side (chunked/streaming for large files per handoff §22), encrypted filename per O6/spec.
- [ ] Download: decrypt client-side; list shows decrypted filenames.

### E6. Hardening (handoff §36 XSS — highest priority)
- [ ] Strict CSP headers (no `unsafe-inline`/`unsafe-eval` on app pages; document any exception with rationale).
- [ ] Zero third-party scripts on pages that touch key material; no analytics on those pages.
- [ ] Dependency review of everything shipped to the client.
- [ ] React output audit: no `dangerouslySetInnerHTML` with untrusted data.

## Exit criteria

- [ ] MVP criteria #1–#10 achievable end-to-end in the browser.
- [ ] Manual + automated check: no plaintext secret in localStorage, IndexedDB, cookies, network requests, or console logs during a full user journey.
- [ ] CSP verified in browser devtools; violations = build failure or documented exception.
- [ ] Worklog entry written.
