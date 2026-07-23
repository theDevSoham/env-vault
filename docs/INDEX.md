# docs/ — INDEX

Bookkeeping documents for Env Vault: threat models, protocol specifications, decision records, and reference material. Every file added to this folder **must** get a one-line entry here.

Format: `- [Title](file.md) — one-line description (status)`

## Documents

- [Threat Model](threat-model.md) — assets, trust boundaries, adversaries T1–T10, non-goals, known limitations L1–L4 (Reviewed — Phase H)
- [V1 Security Review](security-review-v1.md) — Phase H findings log: H1–H8 results, SR-1…SR-7 fixes, accepted risks, MVP #18/#19 sign-off (Complete)
- [Cryptographic Specification](crypto-spec.md) — primitives, versioned envelope formats, key hierarchy, KDF params, nonce strategy, snapshot & diff formats, crypto module API (Draft — binding for Phase B)
- [Account & Key Lifecycle](account-key-lifecycle.md) — signup, login/unlock, password change, KDF upgrades, recovery posture, deletion (Draft)
- [Sharing & Invitation Protocol](sharing-protocol.md) — invitation states, existing-user flow, deferred-wrap flow, multi-generation entitlement, fingerprints (Draft)
- [Revocation & Key Rotation Protocol](revocation-protocol.md) — precise guarantee, atomic rotation protocol, failure/concurrency handling, history across generations (Draft)
- [Revision Encryption & Commit Model](revision-model.md) — snapshot-per-revision, optimistic-concurrency commit, restore, comparison, value concealment (Draft)
- [CLI Key Provisioning](cli-key-provisioning.md) — device-authorization protocol, endpoints, storage-at-rest, token/revocation semantics (Final — Phase 1.5)
- [Machine Identities & Temporary Access](machine-identities.md) — service-account protocol, expiring memberships, explicit decisions (Final — Phase 2)
- [CI / GitHub Actions Usage](ci-github-actions.md) — non-interactive CLI mode, workflow example, secret-handling guidance (Final — Phase 2)

## Decision records (`decisions/`)

- [ADR-001](decisions/adr-001-crypto-library.md) — crypto library: libsodium-wrappers + WebCrypto hybrid (Accepted)
- [ADR-002](decisions/adr-002-auth-strategy.md) — auth: first-party email+password, derived auth key (Accepted)
- [ADR-003](decisions/adr-003-argon2id-params.md) — Argon2id parameters policy v1: 64 MiB / ops 3 (Accepted)
- [ADR-004](decisions/adr-004-metadata-sensitivity.md) — vault/environment/file names encrypted (Accepted)
- [ADR-005](decisions/adr-005-pending-invitations.md) — pending invitations via deferred wrap (Accepted)
- [ADR-006](decisions/adr-006-database-orm.md) — Neon Postgres + Drizzle ORM, node-postgres driver (Accepted)
- [ADR-007](decisions/adr-007-object-storage.md) — storage adapter interface; Postgres-backed blob store for V1 (Accepted)
- [ADR-008](decisions/adr-008-cli-runtime.md) — CLI runtime: Node/tsx in-repo sharing the crypto module; 0600-file credential storage V1 (Accepted)
- [ADR-009](decisions/adr-009-service-accounts.md) — service accounts as flagged users on the device-grant machinery (Accepted)
- [ADR-010](decisions/adr-010-ui-component-strategy.md) — UI: custom in-repo component kit, zero new runtime deps (preserves Phase H client-surface invariant) (Accepted)

## Planned

*(none — V1 documentation set is complete; next planned doc is the finalized CLI provisioning design before Phase 1.5)*

## Conventions

- One topic per file, kebab-case filenames.
- ADRs go in `docs/decisions/` as `adr-NNN-<slug>.md` and are indexed here.
- Security-sensitive documents state their review status at the top (Draft / Reviewed).
