# 10 — Phase 2: Machine Access & Temporary Membership

**Status: DONE (2026-07-23)** — see [worklog/phase-2-machine-access__worklog_2026-07-23.md](../worklog/phase-2-machine-access__worklog_2026-07-23.md)

**Goal:** the handoff §33 Phase 2 items that fit the current architecture: service accounts / machine identities, CI (GitHub Actions) usage, temporary access, expiring memberships. Design: [docs/machine-identities.md](../docs/machine-identities.md), [ADR-009](../docs/decisions/adr-009-service-accounts.md).

**Dependencies:** Phase 1.5. Out of scope here (still future): SSO, advanced RBAC, self-hosting, automated secret rotation (handoff §33 Phase 3).

## Steps

### P2-1. Expiring memberships / temporary access
- [x] Migration 0004: `users.is_service`, `vault_memberships.expires_at`, `invitations.membership_expires_at`.
- [x] Guard: expired membership ⇒ 404 via the central `getMembership` (lazy, no cron) — every endpoint inherits it.
- [x] Invitations accept optional `membershipTtlDays`; applied at activation (both flows).
- [x] Owner set/clear endpoint (self-expiry and past dates rejected); members list shows expiry.
- [x] UI: TTL on invite (via SA panel field pattern), Expiry button per member, amber expiry badges; copy states expiry is authorization-level (rotation stays the cryptographic revocation).
- [x] Tests: TTL applies via invitation; force-expired membership → 404; extend/clear; self/past rejected.

### P2-2. Service accounts
- [x] ADR-009 realized: SA = flagged user on existing membership/envelope/guard machinery; bearer credential = device-grant row created `approved` with server-side one-time token return.
- [x] Routes: create (owner; stale-generation wrap rejected), list, revoke (membership deactivated + token cleared immediately).
- [x] Client flow + owner UI panel: keypair + wrap generated in-browser; one-time credential display with fingerprint; revoke with rotation reminder. SAs appear in members list (SERVICE badge) and participate in rotation like any member.
- [x] Tests (real crypto): creation + one-time token, SA bearer pull with full decrypt chain through its own keypair, revoke → immediate 401, stale generation → 400.

### P2-3. CI / GitHub Actions
- [x] CLI non-interactive mode: `ENVVAULT_CREDENTIALS` (base64 blob) — no login flow, no local file; works for all read commands and `run`.
- [x] [docs/ci-github-actions.md](../docs/ci-github-actions.md): working workflow example + secret-handling guidance + why no marketplace action in V1.
- [x] **End-to-end verified live:** SA minted via the browser-equivalent flow → CLI with only the env var listed the vault as `member`, pulled correct plaintext, and `run` injected `JWT_SECRET` into a child process; the UI then showed the SA's last-used timestamp and revoked it.

## Exit criteria

- [x] Owner grants CI pull access with the server never able to decrypt; credential shown once (server keeps pubkey + token hash only).
- [x] Temporary members lose API access at expiry automatically; UI honest about authorization-vs-cryptography.
- [x] Suite 98 green; tsc/lint/build clean (35 routes); docs + worklog written.
