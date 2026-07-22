# ADR-002 — Authentication: first-party email+password with derived auth key

**Status:** Accepted (Phase A) · **Resolves:** O2 · **Date:** 2026-07-23

## Context

Zero-knowledge requires the password to exist client-side to derive encryption keys (handoff §13–14). Auth must stay strictly separate from encryption (handoff §23): a stolen session or auth database must never yield decryption ability.

## Decision

First-party credentials using the **derived-auth-key pattern** (Bitwarden-style, spec'd in [crypto-spec.md](../crypto-spec.md) §3 and [account-key-lifecycle.md](../account-key-lifecycle.md)):

- One password → Argon2id → master key → KDF-split into `authKey` (login credential) and `KEK` (private-key encryption). Domain separation guarantees independence.
- Server stores only a re-hash of `authKey`; sessions via HttpOnly cookies. No third-party auth provider or framework dependency for V1; route-handler middleware is small and fully controlled.

## Consequences

- Single password unlocks both auth and crypto — matches the required UX, and password change/KDF upgrades are self-contained flows.
- We own rate limiting, lockout, session management (Phase D1/D5) — small, well-understood surface; must be built carefully.
- OAuth "Sign in with X" is **incompatible with V1's key model** (no password → no PDK) and is explicitly not offered. If ever added, it authenticates only; a separate passphrase would still gate key material. Enterprise SSO is out of scope regardless (handoff §32).

## Alternatives rejected

- **Auth.js / managed auth (Clerk, etc.):** adds third-party code to security-critical pages (XSS surface, T8), encourages OAuth flows that break password-derived keys, and still requires all the custom key-handling work — the hard part isn't outsourced.
- **OPAQUE/SRP (PAKE):** stronger theoretical login (password-equivalent never transits), but immature browser tooling and significant complexity; the derived-auth-key over TLS is the established pattern in deployed zero-knowledge products. Revisit post-V1 if warranted.
