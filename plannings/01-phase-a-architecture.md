# 01 — Phase A: Architecture & Security Design

**Status: DONE (2026-07-23)** — see [worklog/phase-a-security-design__worklog_2026-07-23.md](../worklog/phase-a-security-design__worklog_2026-07-23.md)

**Goal:** produce the written security design that everything else implements. No application code in this phase — the deliverables are documents in `docs/` and resolved decisions in [ARCHITECTURE.md](../ARCHITECTURE.md).

**Dependencies:** none. **Blocks:** all other phases.

## Steps

### A1. Threat model → `docs/threat-model.md`
- [x] Enumerate assets (secrets, keys, metadata, memberships, audit trail).
- [x] Enumerate adversaries per handoff §36 (+T9 key substitution, T10 user enumeration).
- [x] Define trust boundaries (browser/CLI = trusted; server/DB/object storage = untrusted for confidentiality).
- [x] Document non-goals from handoff §4 & §37, plus known limitations L1–L4.
- [x] Decide open decision **O6**: names are sensitive → encrypted ([ADR-004](../docs/decisions/adr-004-metadata-sensitivity.md)).

### A2. Crypto specification → `docs/crypto-spec.md`
- [x] Resolve **O1**: libsodium-wrappers + WebCrypto AES-GCM hybrid ([ADR-001](../docs/decisions/adr-001-crypto-library.md)).
- [x] Define versioned envelope schemas (`enc.rec`, `enc.box`, `enc.stream`, KDF record).
- [x] Define key hierarchy: PDK → KEK/authKey split, keypair, vault keys with generations.
- [x] Resolve **O5**: Argon2id 64 MiB / ops 3, per-user stored, upgradable ([ADR-003](../docs/decisions/adr-003-argon2id-params.md)).
- [x] Define nonce-generation strategy (CSPRNG-only, module-internal, collision bound documented).
- [x] Define encrypted snapshot format (stable key ids for exact rename detection; AAD binding).
- [x] Define encrypted structural-diff metadata format.

### A3. Account & key lifecycle → `docs/account-key-lifecycle.md`
- [x] Signup flow (what the server stores/never receives).
- [x] Resolve **O2**: first-party derived-auth-key pattern ([ADR-002](../docs/decisions/adr-002-auth-strategy.md)).
- [x] Password-change flow (re-encrypt private key; vault keys unaffected) + KDF upgrade path.
- [x] No-recovery posture documented with honest UX requirements.

### A4. Sharing & invitation protocol → `docs/sharing-protocol.md`
- [x] Envelope-wrapping flow for existing users, with fingerprint step.
- [x] Resolve **O7**: deferred wrap by owner's client ([ADR-005](../docs/decisions/adr-005-pending-invitations.md)); no escrow.
- [x] Invitation states & transitions: pending / accepted / active / revoked / expired.

### A5. Revocation protocol → `docs/revocation-protocol.md`
- [x] Atomic rotation sequence with single-transaction server commit.
- [x] Failure/rollback + concurrency behavior (base-generation and base-revision checks).
- [x] Key-generation tracking; history remains readable to remaining members.

### A6. Revision encryption model → `docs/revision-model.md`
- [x] Full-snapshot-per-revision format + revision fields.
- [x] Optimistic-concurrency commit protocol with conflict/rebase flow.
- [x] Restore-as-new-revision semantics (re-encrypted at current generation).

### A7. CLI key provisioning strategy (design only) → `docs/cli-key-provisioning.md`
- [x] Resolve **O8** at approach level: device-authorization + device-keypair wrap; constraints on earlier phases captured. Full design remains gated before Phase 1.5 code.

## Exit criteria

- [x] All docs exist in `docs/` and are indexed in `docs/INDEX.md` (7 docs: the six planned + account-key-lifecycle split into its own file).
- [x] Open decisions O1, O2, O5, O6, O7 resolved via ADRs in `docs/decisions/`; ARCHITECTURE.md §9/§10 updated.
- [x] O3, O4 explicitly deferred to Phase C with rationale (recorded in ARCHITECTURE.md §10 and Phase C plan).
- [x] Worklog entry written.
