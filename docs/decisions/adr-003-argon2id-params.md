# ADR-003 — Argon2id parameters

**Status:** Accepted (Phase A) · **Resolves:** O5 · **Date:** 2026-07-23

## Context

Handoff §14: memory-hard parameters appropriate for target clients (browsers incl. mid-range laptops/phones via wasm), stored per-user, upgradable, with documented rationale. The KDF runs at signup, login, unlock, and password change — roughly once per session.

## Decision — policy v1

| Parameter | Value | Notes |
|---|---|---|
| Algorithm | Argon2id v1.3 | libsodium `crypto_pwhash`, `ALG_ARGON2ID13` |
| Memory (`mem`) | 64 MiB (67 108 864 B) | ~3.4× OWASP's 19 MiB floor; safely allocatable in browser wasm, including mobile |
| Iterations (`ops`) | 3 | With 64 MiB ≈ 0.5–1.5 s in browser wasm on mid-range hardware — acceptable for a once-per-session unlock |
| Parallelism | 1 | libsodium's `crypto_pwhash` is fixed at p=1 |
| Salt | 16 B CSPRNG, unique per user | Regenerated on every password change |
| Output | 32 B master key | Split downstream via `crypto_kdf` |

Parameters are stored per-user as the versioned record in [crypto-spec.md](../crypto-spec.md) §2.4 and applied from storage at login — never hardcoded at call sites.

## Rationale

- Above current OWASP minimum (19 MiB / t=2 / p=1) with margin, below levels (≥256 MiB) that fail or crawl on mobile wasm.
- Interactive frequency justifies ~1 s cost; server-side stretching of `authKey` (account-key-lifecycle §1) adds defense-in-depth without client cost.

## Upgrade path

Current policy lives in one constant in `src/lib/crypto/`. On login, if a user's stored params < policy, the client transparently re-derives and re-encrypts via the password-change flow ([account-key-lifecycle.md](../account-key-lifecycle.md) §4). Policy history: v1 = this ADR. Revisit at each security review (Phase H) against hardware trends.
