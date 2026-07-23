# Phase 1.5 — CLI · Worklog · 2026-07-23

**Plan:** [plannings/09-phase-cli.md](../plannings/09-phase-cli.md) (CLI-1…CLI-4 complete)
**Design:** [docs/cli-key-provisioning.md](../docs/cli-key-provisioning.md) (Final) · [ADR-008](../docs/decisions/adr-008-cli-runtime.md)

## What was done

Honored the gate: finalized + reviewed the provisioning design **before** writing code. Then built the device-grant backend (migration 0003, 7 routes, bearer-auth path), the browser `/devices` approval page, and the `envvault` CLI (`login`, `logout`, `vaults`, `envs`, `pull`, `run`) — reusing the exact `src/lib/crypto` and `envformat` modules the web client uses (zero crypto duplication, per ADR-008).

## Design refinements vs. the Phase A sketch (explicit, not silent)

- **Token issued at first poll, not at approval** — an atomic `tokenHash IS NULL` claim makes delivery one-shot and means plaintext token material never exists at rest (poll is pollSecret-authenticated).
- **Storage at rest V1**: `~/.envvault/credentials.json` chmod 0600 (device privkey + sealed envelope + token; user key never stored unwrapped) instead of OS keychains — trade-off documented in the doc §4 and ADR-008; Windows ACL limitation printed at login.
- **Password change does not revoke device grants** (they wrap the raw private key, which survives re-encryption) — documented; devices page is the review surface.

## Verification

- **Full end-to-end against the real dev server:** `npm run cli -- login` printed code `5ADH-C5FM` + fingerprint `46AF-12DD-2F07-9C7A` → browser `/devices` lookup showed the **matching fingerprint** (T9 check works as designed) → approve → CLI stored credentials → `vaults` decrypted "Acme Project" through the device→user→vault key chain → `envs` listed Development rev 3 → `pull` produced correct `.env` and JSON → `run -- node -e …` child saw `DATABASE_URL` with nothing written to disk → `logout` revoked server-side; subsequent commands correctly fail.
- **5 integration tests** (real crypto through handlers): code format; poll requires pollSecret (404 otherwise); one-shot token claim ("consumed" on second poll); sealed-box round-trip returns the user private key byte-equal; bearer auth + decrypt chain + garbage-token 401; revoke kills the token immediately.
- Suite 93/93; tsc, lint, `next build` (32 routes incl. 7 device routes + `/devices` page) clean.

## Files touched

Created: `cli/` (index, session, api, store), `app/api/devices/**` (7 routes), `app/devices/page.tsx`, `src/lib/db/devices.ts`, `drizzle/0003_device-grants.sql`, `src/lib/api-server/__tests__/devices.integration.test.ts`, `docs/decisions/adr-008-cli-runtime.md`.
Updated: `docs/cli-key-provisioning.md` (Final), `src/lib/db/schema.ts` (+device_grants), `db/index.ts`, `db/audit.ts` (+2 event types), `api-server/sessions.ts` (bearer path), `api/client.ts` + `client/flows.ts` (+device approval), `app/vaults/page.tsx` (devices link), `package.json` (+tsx dev, `cli` script), docs/INDEX, AGENTS.md map, plannings.

## Follow-ups

- Packaging: npm-published `envvault` bin when the product ships publicly; OS-keychain storage in Phase 2 (both in ADR-008).
- Poll loop is fixed 3s; fine for V1 (rate limit 30/min allows it).
- The handoff's recommended V1+ path is now fully delivered: Phases A–H + 1.5 all done.
