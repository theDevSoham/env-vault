# worklog/ — INDEX

Completed work logs. One file per completed feature/issue, added **after** the work is done, then indexed here (newest first).

**File naming:** `<feature-or-issue>__worklog_<YYYY-MM-DD>.md`
Examples: `crypto-module__worklog_2026-08-01.md`, `vault-creation-api__worklog_2026-08-15.md`

**Each worklog should contain:**

- **What was done** — summary of the completed work.
- **Decisions made** — anything decided during implementation (link ADRs in `docs/` where applicable).
- **Files touched** — key files created/modified.
- **Verification** — how it was tested/verified.
- **Follow-ups** — deferred items, known gaps (also reflect these in the relevant `plannings/` file).

## Worklogs (newest first)

- [Phase F — Version Control](phase-f-version-control__worklog_2026-07-23.md) — 2026-07-23 — compare/restore/conflict-rebase; 4 real-crypto API integration tests; browser-verified; suite at 88.
- [Phase E — Web Client](phase-e-web-client__worklog_2026-07-23.md) — 2026-07-23 — client crypto flows, in-memory keystore, full UI, CSP via proxy.ts; MVP journey verified in a real browser; suite at 84.
- [Phase D — Backend APIs](phase-d-backend-apis__worklog_2026-07-23.md) — 2026-07-23 — auth + sessions, central vault guard, 25 ciphertext-only routes, 12 authorization-matrix tests; suite at 81 green.
- [Phase C — Data Model](phase-c-data-model__worklog_2026-07-23.md) — 2026-07-23 — Drizzle schema (11 tables) on Neon Postgres, append-only triggers, atomic rotation tx, blob-store adapter; 16 integration tests green.
- [Phase B — Crypto Prototype](phase-b-crypto-prototype__worklog_2026-07-23.md) — 2026-07-23 — `src/lib/crypto/` implemented per crypto-spec; 53 tests green incl. sharing/revocation/restore flows, tamper & isolation checks.
- [Phase A — Security Design](phase-a-security-design__worklog_2026-07-23.md) — 2026-07-23 — all seven design docs + ADR-001…005 written; O1/O2/O5/O6/O7 resolved, O3/O4 deferred to Phase C.
