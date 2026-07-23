# Env Vault — Machine Identities & Temporary Access (Phase 2)

**Status:** Final (Phase 2, 2026-07-23) — reviewed against the threat model before implementation
**Related:** [ADR-009](decisions/adr-009-service-accounts.md), [cli-key-provisioning.md](cli-key-provisioning.md), [ci-github-actions.md](ci-github-actions.md)

---

## 1. Service accounts (machine identities)

A service account (SA) is a **non-human cryptographic identity** for CI/CD: its own X25519 keypair, vault membership, and bearer token — with the same zero-knowledge property as human members. The server can authorize an SA; it can never decrypt for one.

### Creation (owner's browser, all crypto client-side)

1. Owner names the SA (e.g. `github-actions-prod`).
2. Browser generates the SA keypair and wraps the **current vault key** to it (`enc.box` — the standard member wrap).
3. `POST /api/vaults/[id]/service-accounts { name, publicKey, envelope }` → server creates the SA identity, a vault membership, stores the envelope, and returns a bearer token **once**.
4. Browser assembles the **machine credential** — `base64(JSON{ v, serverUrl, token, publicKey, privateKey })` — and shows it exactly once for pasting into the CI secret store. The private key never touches the server; Env Vault cannot re-issue the credential, only replace it.

### Authentication & authorization

- SAs authenticate with the bearer token (same header, hash-only at rest, reusing the device-grant machinery — ADR-009).
- SAs hold a normal `member` membership (vault-level access, handoff §6): they can pull. The UI does not offer SA commits in V1; nothing cryptographic prevents a credential holder from writing — access control is authorization, not encryption, consistent with handoff §4.
- CI usage: the CLI reads `ENVVAULT_CREDENTIALS` (the base64 blob) and runs non-interactively — no login flow, no local file (see [ci-github-actions.md](ci-github-actions.md)).

### Revocation

Deleting an SA deactivates its membership and kills its token immediately (authorization). As with humans (handoff §20): the credential may have decrypted keys already — **rotate the vault key** via the standard member-removal path for the cryptographic guarantee. The UI says so.

## 2. Temporary access & expiring memberships

- `vault_memberships.expires_at` (nullable): past-expiry memberships fail the central guard exactly like non-membership (404 — no existence leak). Enforcement is lazy (checked at access time); no cron needed.
- Owners can set an optional expiry when inviting (temporary access), and set/clear expiry on existing members and service accounts.
- **Honest semantics (documented in UI):** expiry is *authorization-level*. An expired member retains any keys they already unwrapped; key rotation (member removal) remains the cryptographic revocation. Expiry is for the common cooperative case — contractors, short-lived CI credentials — not for adversaries.

## 3. Explicit decisions

| Decision | Rationale |
|---|---|
| SA = flagged user row reusing memberships/envelopes/guards | One authorization path to audit; no parallel ACL system (ADR-009) |
| SA private key handed to the CI secret store | The only zero-knowledge-preserving option: *some* trusted context must hold key material; for machines that context is the CI's secret store — Env Vault's server never can (handoff §39) |
| Credential shown once, never recoverable | Server stores only pubkey + token hash; loss ⇒ create a replacement SA |
| Expiry is lazy + authorization-only | No background jobs; cryptographic revocation stays with rotation |
| GitHub Actions V1 = documented workflow, not a marketplace action | An action wrapper adds no security value yet; the CLI's non-interactive mode is the integration point |
