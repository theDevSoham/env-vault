# plannings/ — INDEX

Concrete, ordered plans to reach the MVP defined in [PROJECT_HANDOFF.md](../PROJECT_HANDOFF.md) §38. Phases execute in order (handoff §35); a phase should not start until its dependencies are met. Update the status column and the checkboxes inside each plan as work progresses.

Statuses: `not-started` · `in-progress` · `blocked` · `done`

| # | Plan | Depends on | Status |
|---|---|---|---|
| 00 | [Roadmap & MVP success criteria](00-roadmap.md) | — | in-progress |
| 01 | [Phase A — Architecture & security design](01-phase-a-architecture.md) | — | done |
| 02 | [Phase B — Crypto prototype](02-phase-b-crypto-prototype.md) | 01 | done |
| 03 | [Phase C — Data model](03-phase-c-data-model.md) | 01, 02 | done |
| 04 | [Phase D — Backend APIs](04-phase-d-backend.md) | 03 | not-started |
| 05 | [Phase E — Web client](05-phase-e-web-client.md) | 02, 04 | not-started |
| 06 | [Phase F — Version control](06-phase-f-version-control.md) | 05 | not-started |
| 07 | [Phase G — Export](07-phase-g-export.md) | 05 | not-started |
| 08 | [Phase H — Security review](08-phase-h-security-review.md) | 04–07 | not-started |
| 09 | [Phase 1.5 — CLI](09-phase-cli.md) | 08 | not-started |

## Conventions

- Plans are numbered in execution order: `NN-<slug>.md`.
- Each plan lists: goal, dependencies, concrete steps (checkboxes), and exit criteria.
- When a step reveals a security-sensitive decision, do **not** pick silently — record it in [ARCHITECTURE.md](../ARCHITECTURE.md) §10 and resolve via an ADR in `docs/decisions/`.
- On completing a phase: check off its exit criteria, set status `done` here, and write a worklog entry ([worklog/INDEX.md](../worklog/INDEX.md)).
