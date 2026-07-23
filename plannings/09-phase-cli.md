# 09 — Phase 1.5: CLI

**Status: DONE (2026-07-23)** — see [worklog/phase-1.5-cli__worklog_2026-07-23.md](../worklog/phase-1.5-cli__worklog_2026-07-23.md)

**Goal:** `envvault` CLI with secure login and local-only decryption (handoff §24–26). Architecturally first-class, delivered only after Phase H.

**Dependencies:** Phase H complete; `docs/cli-key-provisioning.md` finalized and reviewed. **Blocks:** nothing in V1.

> ✅ Gate satisfied: the provisioning design was finalized and reviewed against the threat model **before** implementation (doc status: Final).

## Steps

### CLI-1. Security design finalization
- [x] `docs/cli-key-provisioning.md` finalized: device-authorization protocol (code + pollSecret + fingerprint comparison), endpoint table, one-shot token issuance **at first poll** (plaintext token never at rest), storage-at-rest, token/revocation semantics incl. the password-change-doesn't-revoke-devices caveat.
- [x] Storage deviation from the Phase A sketch documented explicitly (0600 file now, OS keychain in Phase 2) — [ADR-008](../docs/decisions/adr-008-cli-runtime.md).
- [x] No password-on-argv path exists anywhere in the CLI.

### CLI-2. Foundation
- [x] Runtime/distribution ADR-008: Node ≥20 + tsx in-repo (`npm run cli -- …`), importing the SAME `src/lib/crypto` and `envformat` modules as the web client — zero crypto duplication.
- [x] Backend: `device_grants` table (migration 0003), 7 routes (start/poll/pending/approve/deny/list/revoke), bearer-token auth path in `getSessionUserId` (separate from cookies, per-device revocable), `device_approved`/`device_revoked` audit events.
- [x] Web `/devices` page: code entry → device name + **fingerprint** display → approve (browser wraps the in-memory private key to the device pubkey) / deny; device list with revoke + honest retention warning. Linked from the vaults header.
- [x] `envvault login`: device flow end-to-end; credentials at `~/.envvault/credentials.json` (0600; device privkey + wrapped envelope + token — user key never stored unwrapped); `logout` revokes server-side and deletes locally.

### CLI-3. Read commands
- [x] `envvault vaults` — names decrypted locally via device→user→vault key chain.
- [x] `envvault envs --vault <id|name>`.
- [x] `envvault pull --vault --env [--format env|json] [--out PATH|-]` — local decrypt; explicit **PLAINTEXT warning** on file writes (stderr, so piping stays clean); `export_requested` audit event.

### CLI-4. Run injection
- [x] `envvault run --vault V --env E -- <cmd…>` — secrets injected into the child process environment only; nothing written to disk.

## Exit criteria

- [x] Login never accepts passwords via argv/env; server never gains decryption ability (poll delivers a sealed box it cannot open).
- [x] `pull` output matches web export byte-semantics — same `envformat` serializers by construction (shared module), verified identical content in the live run.
- [x] **End-to-end verified against the real dev server:** `login` printed code+fingerprint → browser showed the matching fingerprint → approve → `vaults`/`envs` decrypt → `pull` both formats correct → `run` child saw `DATABASE_URL` → `logout` revoked (subsequent calls 401/logged-out).
- [x] 5 new integration tests (real crypto): code format, pollSecret required, one-shot token claim, sealed-box round-trip byte-equality, bearer auth + full decrypt chain, revoke kills token immediately. Suite: 93 green; tsc/lint/build clean.
- [x] Docs updated (provisioning Final, ADR-008, AGENTS map); worklog written.
