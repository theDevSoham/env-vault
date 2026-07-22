# ADR-004 — Metadata sensitivity: vault, environment & file names are encrypted

**Status:** Accepted (Phase A) · **Resolves:** O6 · **Date:** 2026-07-23

## Context

Decision D1 already encrypts secret key names and values (Model B, handoff §12). Open question O6: are vault names, environment names, and secret filenames sensitive? They are free-text user content and routinely reveal infrastructure ("acme-prod-payments", "stripe-webhook-service-account.json"). Handoff §22 already leans toward encrypting sensitive filenames.

## Decision

Encrypt **vault names, environment names, and secret filenames** client-side under the vault key (`enc.rec` with binding AADs — [crypto-spec.md](../crypto-spec.md) §7).

Plaintext by design (non-sensitive identifiers, handoff §12): row ids, timestamps, revision numbers, key generations, actor ids, roles, membership rows, invitation states, audit event types, file sizes.

## Consequences

- Vault/environment lists render only after the client unwraps each vault key — acceptable: envelope unwrap is fast, and lists are small (1–20 users, few vaults).
- Server-side search over names is impossible; search is client-side (already true for secrets under D1).
- Invitation emails and pending-invite UI **cannot show the vault name** (invitee holds no key yet) — sharing-protocol §4 designs for this; inviter identity (email) is the displayed context.
- Audit events reference vaults/environments by id; the member-facing audit UI resolves names client-side.
- Environment names being encrypted means the server also can't distinguish Development from Production — deployment-context-based server features (none planned in V1) would need rethinking.

## Alternatives rejected

- **Plaintext names:** persistent metadata leakage of exactly the kind §12 warns about, for modest UX gain that client-side decryption covers anyway.
- **Owner-chosen per-name flag:** more complexity than V1 warrants; encrypt-by-default is the safer uniform rule.
