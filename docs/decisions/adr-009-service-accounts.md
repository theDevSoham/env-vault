# ADR-009 — Service accounts as flagged users on the device-grant machinery

**Status:** Accepted (Phase 2) · **Date:** 2026-07-23

## Context

CI/CD needs non-human identities that can pull secrets without a browser or password, preserving zero-knowledge ([machine-identities.md](../machine-identities.md)). We already have: per-member vault-key envelopes, a central membership guard, and hash-at-rest bearer tokens (device grants).

## Decision

- A service account is a **`users` row with `is_service = true`**: synthetic unique email (`sa-<uuid>@service.internal`), unusable random auth verifier (never logs in via password), a `user_keys` row holding its public key with a placeholder `encPrivKeyEnv` (`{}` — the private key lives only in the CI secret store).
- Vault access via a **normal `vault_memberships` row** + standard `enc.box` envelope — the existing guard, rotation flow, and member lists all apply unchanged (SAs are re-wrapped or excluded during rotation like any member).
- Its bearer token is a **`device_grants` row created directly in `approved` state** (server-generated token returned once at creation; hash-only at rest; same bearer resolution path).

## Consequences

- Zero new authorization surfaces: everything an SA can do flows through code that Phase H already reviewed.
- Rotation "just works": remove-member on an SA excludes it cryptographically like a human.
- Placeholder `encPrivKeyEnv` means `/api/me` is meaningless for SAs — the CLI's non-interactive mode carries the public key inside the credential and never calls `/me`.
- Login route is unaffected: SAs have no known authKey, and the verifier is a hash of 32 random bytes nobody holds.

## Alternatives rejected

- **Dedicated SA tables + parallel guard:** duplicates the most security-critical code path for no capability gain.
- **Server-generated SA keypairs:** the server would momentarily hold a private key — breaks the invariant outright.
- **Scoped read-only crypto:** impossible; holding the vault key implies decryption. Read-only is enforced at the authorization layer and documented as such (handoff §4).
