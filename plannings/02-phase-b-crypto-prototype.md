# 02 — Phase B: Crypto Prototype

**Status: DONE (2026-07-23)** — see [worklog/phase-b-crypto-prototype__worklog_2026-07-23.md](../worklog/phase-b-crypto-prototype__worklog_2026-07-23.md)

**Goal:** implement and test the entire cryptographic layer in isolation — no database, no UI, no network (handoff §35 Phase B). Output is the reviewed crypto module that all later phases consume unchanged.

**Dependencies:** Phase A (crypto spec must exist). **Blocks:** C, E.

## Steps

### B1. Module skeleton
- [x] Created `src/lib/crypto/` per `docs/crypto-spec.md`; installed `libsodium-wrappers-sumo` (sumo required — standard build lacks `crypto_pwhash`; ADR-001 amended).
- [x] Versioned envelope encode/decode with strict validation (`envelope.ts`; unknown v/t/alg → hard error).
- [x] Test runner: Vitest (`vitest.config.ts`, `npm test`).

### B2. Primitive wrappers (each with unit tests)
- [x] CSPRNG helpers (`sodium.ts`): randomBytes; nonces generated module-internally only.
- [x] Argon2id PDK derivation (`kdf.ts`): params round-trip via stored record; policy v1 exercised in tests; weak-params helper for test speed.
- [x] AEAD encrypt/decrypt (`record.ts`, WebCrypto AES-256-GCM): tamper tests for ct, nonce, AAD, wrong key; anti-transplant AAD check.
- [x] X25519 keypair + sealed-box wrap/unwrap (`keys.ts`).

### B3. Protocol flows as pure functions (each with tests)
- [x] User key generation + private-key encryption under KEK; wrong password fails cleanly; per-user AAD prevents cross-user replay.
- [x] Vault key generation + wrapping for owner.
- [x] Environment snapshot encrypt/decrypt (`snapshot.ts`; names + values inside ciphertext; stable key ids).
- [x] Vault sharing flow: second identity decrypts via its own wrapped envelope (flows.test.ts).
- [x] Revocation flow: rotation to gen 2; removed member's retained gen-1 key cannot decrypt post-rotation state; remaining members read pre- and post-rotation history (key-generation tracking).
- [x] Revision restoration: old snapshot re-encrypted at current generation as a new revision.
- [x] Client-side structural diff by stable id (add/remove/rename/modify incl. rename+modify); diff metadata encrypted with revision binding.

### B4. Negative & property tests
- [x] Nonce uniqueness across 2000 operations; identical inputs → distinct ciphertexts.
- [x] Envelope version/alg mismatch → explicit `UnsupportedEnvelopeError` (no silent fallback).
- [x] No-plaintext scan on serialized envelopes (marker strings, raw key bytes in base64/hex).

## Exit criteria

- [x] All flows in handoff §35 Phase B pass automated tests (53 tests, 7 files, all green).
- [x] Crypto module has no imports from app/db/network code — enforced by an automated isolation test (only `./siblings` + `libsodium-wrappers-sumo` allowed; also asserts zero `console.` calls).
- [x] Public API documented via JSDoc throughout + crypto-spec §9; spec amended with Phase B implementation notes (sumo build, privkey AAD).
- [x] Worklog entry written.
