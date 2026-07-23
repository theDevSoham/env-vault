# ADR-001 — Crypto library: libsodium-wrappers + WebCrypto hybrid

**Status:** Accepted (Phase A) · **Resolves:** O1 · **Date:** 2026-07-23

## Context

We need, in browsers (and later Node for the CLI): Argon2id, X25519 key wrapping, AES-256-GCM (handoff-recommended AEAD), streaming AEAD for large files, all from audited implementations (handoff §34.2). WebCrypto alone lacks Argon2id and sealed-box-style X25519 wrapping; libsodium alone offers AES-256-GCM only on hardware-accelerated targets (not reliably in wasm).

## Decision

- **libsodium-wrappers-sumo (wasm)** for: Argon2id (`crypto_pwhash`), key splitting (`crypto_kdf`), X25519 sealed boxes (`crypto_box_seal`), streaming file encryption (`crypto_secretstream` XChaCha20-Poly1305). *(Phase B note: the sumo build is required — the standard `libsodium-wrappers` build omits `crypto_pwhash`.)*
- **WebCrypto native `AES-GCM`** for record encryption (snapshots, diffs, names, private-key encryption) — exactly the handoff-recommended AEAD, hardware-backed, zero bundle cost.
- Both wrapped exclusively inside `src/lib/crypto/`; versioned envelopes ([crypto-spec.md](../crypto-spec.md) §2) make either primitive replaceable later.

## Consequences

- Two audited implementations instead of one — accepted; both are extremely widely deployed, and each is used squarely in its mainstream configuration.
- File streaming uses XChaCha20-Poly1305 rather than AES-GCM. This is a deliberate, documented deviation for the streaming case only: GCM has no standard streaming construction, and hand-chunking GCM safely is exactly the kind of custom assembly handoff §34.1 forbids. Recorded here per handoff §34.17 rather than adopted silently.
- libsodium version pinned; wasm loading adds ~300 KB and an async init step to the crypto module.

## Alternatives rejected

- **Pure WebCrypto + argon2 wasm side-package:** still needs a wasm dependency for Argon2id, and X25519 sealed-box would require manual ECDH+KDF+AEAD assembly (custom construction risk).
- **Pure libsodium:** loses native AES-GCM; would put the primary record path on software crypto and deviate from the handoff recommendation for all data, not just streams.
