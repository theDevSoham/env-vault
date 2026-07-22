# docs/ — INDEX

Bookkeeping documents for Env Vault: threat models, protocol specifications, decision records, and reference material. Every file added to this folder **must** get a one-line entry here.

Format: `- [Title](file.md) — one-line description (status)`

## Documents

*(none written yet — the entries below are planned Phase A deliverables; see [plannings/01-phase-a-architecture.md](../plannings/01-phase-a-architecture.md))*

- `threat-model.md` — full threat model & trust boundaries (planned)
- `crypto-spec.md` — envelope formats, key hierarchy, KDF parameters & rationale (planned)
- `sharing-protocol.md` — vault sharing, invitation & pending-invite flows (planned)
- `revocation-protocol.md` — member removal + vault-key rotation procedure (planned)
- `revision-model.md` — revision encryption, snapshot format, encrypted diff metadata (planned)
- `cli-key-provisioning.md` — CLI auth & key provisioning design (planned, pre-Phase 1.5)
- `decisions/` — ADRs resolving the open decisions in [ARCHITECTURE.md](../ARCHITECTURE.md) §10 (planned)

## Conventions

- One topic per file, kebab-case filenames.
- ADRs go in `docs/decisions/` as `adr-NNN-<slug>.md` and are indexed here.
- Security-sensitive documents state their review status at the top (Draft / Reviewed).
