# docs/ — INDEX

Bookkeeping documents for Env Vault: threat models, protocol specifications, decision records, and reference material. Every file added to this folder **must** get a one-line entry here.

Format: `- [Title](file.md) — one-line description (status)`

## Documents

- [Threat Model](threat-model.md) — assets, trust boundaries, adversaries T1–T10, non-goals, known limitations L1–L4 (Draft — Phase H review pending)
- [Cryptographic Specification](crypto-spec.md) — primitives, versioned envelope formats, key hierarchy, KDF params, nonce strategy, snapshot & diff formats, crypto module API (Draft — binding for Phase B)
- [Account & Key Lifecycle](account-key-lifecycle.md) — signup, login/unlock, password change, KDF upgrades, recovery posture, deletion (Draft)
- [Sharing & Invitation Protocol](sharing-protocol.md) — invitation states, existing-user flow, deferred-wrap flow, multi-generation entitlement, fingerprints (Draft)
- [Revocation & Key Rotation Protocol](revocation-protocol.md) — precise guarantee, atomic rotation protocol, failure/concurrency handling, history across generations (Draft)
- [Revision Encryption & Commit Model](revision-model.md) — snapshot-per-revision, optimistic-concurrency commit, restore, comparison, value concealment (Draft)
- [CLI Key Provisioning](cli-key-provisioning.md) — device-auth + device-keypair-wrap design sketch; must be finalized before Phase 1.5 (Sketch)

## Decision records (`decisions/`)

- [ADR-001](decisions/adr-001-crypto-library.md) — crypto library: libsodium-wrappers + WebCrypto hybrid (Accepted)
- [ADR-002](decisions/adr-002-auth-strategy.md) — auth: first-party email+password, derived auth key (Accepted)
- [ADR-003](decisions/adr-003-argon2id-params.md) — Argon2id parameters policy v1: 64 MiB / ops 3 (Accepted)
- [ADR-004](decisions/adr-004-metadata-sensitivity.md) — vault/environment/file names encrypted (Accepted)
- [ADR-005](decisions/adr-005-pending-invitations.md) — pending invitations via deferred wrap (Accepted)

## Planned

- `security-review-v1.md` — Phase H findings log (planned)
- ADRs for O3 (database + ORM) and O4 (object storage) — deferred to Phase C (see [plannings/03-phase-c-data-model.md](../plannings/03-phase-c-data-model.md))

## Conventions

- One topic per file, kebab-case filenames.
- ADRs go in `docs/decisions/` as `adr-NNN-<slug>.md` and are indexed here.
- Security-sensitive documents state their review status at the top (Draft / Reviewed).
