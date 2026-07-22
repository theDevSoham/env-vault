# 01 — Phase A: Architecture & Security Design

**Goal:** produce the written security design that everything else implements. No application code in this phase — the deliverables are documents in `docs/` and resolved decisions in [ARCHITECTURE.md](../ARCHITECTURE.md).

**Dependencies:** none. **Blocks:** all other phases.

## Steps

### A1. Threat model → `docs/threat-model.md`
- [ ] Enumerate assets (secrets, keys, metadata, memberships, audit trail).
- [ ] Enumerate adversaries per handoff §36 (DB compromise, object-storage compromise, backend read access, unauthorized user, removed member, network attacker, log leakage, XSS).
- [ ] Define trust boundaries (browser/CLI = trusted; server/DB/object storage = untrusted for confidentiality).
- [ ] Document non-goals verbatim in spirit from handoff §4 & §37 (no over-claiming).
- [ ] Decide open decision **O6**: are vault/environment names sensitive (plaintext vs encrypted)?

### A2. Crypto specification → `docs/crypto-spec.md`
- [ ] Resolve **O1**: crypto library (evaluate libsodium-wrappers vs WebCrypto + Argon2 WASM; must cover Argon2id, X25519 wrapping, AES-256-GCM or crypto_box equivalent). Record as ADR.
- [ ] Define the versioned envelope JSON schema (version, algorithm, nonce, ciphertext, key id) — handoff §34.15.
- [ ] Define key hierarchy precisely: PDK derivation, private-key encryption, vault-key generation & wrapping, per-generation key ids for rotation.
- [ ] Resolve **O5**: Argon2id parameters for browser targets, with documented rationale and an upgrade path (params stored per-user).
- [ ] Define nonce-generation strategy guaranteeing no reuse per key.
- [ ] Define the encrypted environment snapshot format (secret names + values inside one encrypted blob; see ARCHITECTURE.md §2.4 Model B).
- [ ] Define encrypted structural-diff metadata format (client-computed).

### A3. Account & key lifecycle
- [ ] Define signup flow: keypair generation, private-key encryption under PDK, what the server stores (public key, salt, KDF params, encrypted private key, auth verifier).
- [ ] Resolve **O2**: authentication strategy, keeping auth tokens strictly separate from encryption keys (handoff §23). Record as ADR.
- [ ] Define password-change flow (re-encrypt private key; vault keys unaffected).
- [ ] Document that password recovery cannot restore encryption keys (no server-side escrow — handoff §34.12); define honest account-recovery UX consequence.

### A4. Sharing & invitation protocol → `docs/sharing-protocol.md`
- [ ] Define envelope-wrapping flow for existing users (handoff §18).
- [ ] Resolve **O7**: pending invitations to users without accounts — deferred wrapping (owner client wraps when invitee's public key exists); explicitly no key escrow.
- [ ] Define invitation states & transitions: pending / accepted / revoked / expired.

### A5. Revocation protocol → `docs/revocation-protocol.md`
- [ ] Define atomic rotation sequence (handoff §20): remove membership → new vault key → re-encrypt current state → re-wrap for remaining members → commit atomically.
- [ ] Define failure/rollback behavior if rotation is interrupted.
- [ ] Define key-generation tracking so historical revisions remain readable by current members (handoff §21).

### A6. Revision encryption model → `docs/revision-model.md`
- [ ] Specify full-snapshot-per-revision format (Decision D2) and the fields of a revision (handoff §11).
- [ ] Specify optimistic-concurrency commit protocol (base revision number, conflict response, client rebase — handoff §30).
- [ ] Specify restore-as-new-revision semantics (handoff §28).

### A7. CLI key provisioning strategy (design only) → `docs/cli-key-provisioning.md`
- [ ] Resolve **O8**: outline device-authorization login and how the CLI obtains decryption capability without the server ever holding usable keys (handoff §25). Full design may be finalized before Phase 1.5, but the approach must be sketched now so nothing in A2–A5 precludes it.

## Exit criteria

- [ ] All six docs exist in `docs/` and are indexed in `docs/INDEX.md`.
- [ ] Open decisions O1, O2, O5, O6, O7 resolved via ADRs in `docs/decisions/`; ARCHITECTURE.md §9/§10 updated.
- [ ] Remaining open decisions (O3, O4) either resolved or explicitly deferred to Phase C/D with rationale.
- [ ] Worklog entry written.
