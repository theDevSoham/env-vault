# Phase 2 — Machine Access & Temporary Membership · Worklog · 2026-07-23

**Plan:** [plannings/10-phase-2-machine-access.md](../plannings/10-phase-2-machine-access.md) (P2-1…P2-3 complete)
**Design:** [docs/machine-identities.md](../docs/machine-identities.md) · [ADR-009](../docs/decisions/adr-009-service-accounts.md) · [docs/ci-github-actions.md](../docs/ci-github-actions.md)

## What was done

Design-first (per house rule), then: **expiring memberships / temporary access** (P2-1), **service accounts** (P2-2), and **CI usage** (P2-3 — CLI non-interactive mode + GitHub Actions doc). Migration 0004; 3 new routes; suite at 98.

## Key design points

- **SA = flagged user row** (`users.is_service`) on the *existing* membership/envelope/guard/rotation machinery — zero new authorization surfaces to audit (ADR-009). Bearer credential reuses device grants (created directly `approved`, token returned once, hash-only at rest). Placeholder `encPrivKeyEnv` (`{}`); the SA private key exists only in the CI secret store, assembled into a one-time base64 machine credential entirely in the owner's browser.
- **Expiry is authorization-level and lazily enforced** in the central `getMembership` (expired ⇒ 404, identical to non-membership; no cron). UI copy is honest: rotation remains the cryptographic revocation. Set via invitation TTL, per-member Expiry button, or SA creation field; self-expiry and past dates rejected.
- **Stale-generation wrap rejected at SA creation** (the envelope must target the current vault key), preventing an SA from being born with an outdated key.
- CLI: `ENVVAULT_CREDENTIALS` env var short-circuits login/local file — the credential blob carries the SA keypair + token; decrypt chain runs through the same shared crypto module.

## Verification

- **5 integration tests (real crypto):** SA create (one-time token; stale generation → 400), SA bearer pull decrypting vault name + snapshot through its own keypair, revoke → immediate 401; invitation TTL → membership expiry; force-expired → 404; extend/clear/self/past cases.
- **Live end-to-end:** minted an SA via the browser-equivalent flow (temp tsx script, deleted after), then with **only** `ENVVAULT_CREDENTIALS` set: `vaults` listed Acme Project as `member`, `pull` produced the correct plaintext, `run` injected `JWT_SECRET` into a child process. The vault page then showed the SA in Members (SERVICE badge) and in the new panel with matching fingerprints + last-used timestamp from that very pull; revoked it via the UI.
- Suite 98/98; tsc/lint/`next build` (35 routes) clean.
- **User question answered this session** (recorded for posterity): decryption is *not* device-bound — secrets encrypt under the vault key, wrapped to the per-account keypair; any unlocked browser or approved CLI device recovers the same account key, so cross-device upload/download works by construction.

## Files touched

Created: `docs/machine-identities.md`, `docs/ci-github-actions.md`, `docs/decisions/adr-009-service-accounts.md`, `src/lib/db/serviceaccounts.ts`, `src/components/ServiceAccountsPanel.tsx`, 3 route files (service-accounts create/list, revoke, member expiry), `drizzle/0004_phase2-machine-access.sql`, `src/lib/api-server/__tests__/phase2.integration.test.ts`, `plannings/10`.
Updated: schema (3 columns), `vaults.ts` (guard expiry + setMembershipExpiry + member list fields), `invitations.ts` (membership TTL through both flows), `audit.ts` (+3 event types), `db/index.ts`, `validate.ts`, invitations route, `api/client.ts`, `client/flows.ts` (+createServiceAccount), `MembersPanel.tsx`, vault page, `cli/session.ts` (env-var mode), docs/INDEX, plannings/INDEX.

## Follow-ups

- Remaining handoff §33 Phase 2 ideas not in this slice: none blocking — "temporary access" and "expiring memberships" shipped; GitHub Actions is served by the documented workflow until public packaging (ADR-008) warrants a marketplace action.
- Phase 3 items (SSO, advanced RBAC, self-hosting, automated rotation) remain future scope with real architectural design needed — especially automated rotation, which tensions with zero-knowledge.
