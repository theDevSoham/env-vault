# 02 — Phase B: Crypto Prototype

**Goal:** implement and test the entire cryptographic layer in isolation — no database, no UI, no network (handoff §35 Phase B). Output is the reviewed crypto module that all later phases consume unchanged.

**Dependencies:** Phase A (crypto spec must exist). **Blocks:** C, E.

## Steps

### B1. Module skeleton
- [ ] Create `src/lib/crypto/` per `docs/crypto-spec.md`; install the chosen library (ADR from O1).
- [ ] Implement the versioned envelope encode/decode with strict validation.
- [ ] Set up a test runner (e.g. Vitest) — this phase is driven entirely by tests.

### B2. Primitive wrappers (each with unit tests)
- [ ] CSPRNG helpers (key generation, nonce generation — collision-safe strategy from spec).
- [ ] Argon2id PDK derivation (params from spec; params round-trip through storage format).
- [ ] AEAD encrypt/decrypt (tamper detection test: flipped byte must fail).
- [ ] X25519 keypair generation + envelope wrap/unwrap.

## B3. Protocol flows as pure functions (each with tests)
- [ ] User key generation: keypair + private key encrypted under PDK; wrong password fails cleanly.
- [ ] Vault key generation + wrapping for owner.
- [ ] Environment snapshot encrypt/decrypt (secret names + values inside ciphertext).
- [ ] Vault sharing: wrap vault key for a second keypair; second identity can decrypt snapshot.
- [ ] Revocation: rotate vault key, re-encrypt snapshot, re-wrap for remaining members; **test that the removed member's old key cannot decrypt post-rotation state, and that remaining members can still read pre-rotation revisions** (key-generation tracking).
- [ ] Revision restoration: reconstruct environment state from an older snapshot.
- [ ] Client-side structural diff: given two decrypted snapshots, compute added/removed/renamed/modified; encrypt the diff metadata.

### B4. Negative & property tests
- [ ] Nonce uniqueness across a large batch of operations.
- [ ] Envelope version mismatch handled explicitly (no silent fallback).
- [ ] No plaintext appears in any serialized output (scan test on fixtures).

## Exit criteria

- [ ] All flows in handoff §35 Phase B pass automated tests.
- [ ] Crypto module has no imports from app/db/network code (isolation enforced).
- [ ] Public API of `src/lib/crypto/` documented (JSDoc or `docs/crypto-spec.md` appendix).
- [ ] Worklog entry written.
