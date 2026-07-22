# ADR-005 — Pending invitations: deferred wrap by the owner's client

**Status:** Accepted (Phase A) · **Resolves:** O7 · **Date:** 2026-07-23

## Context

Inviting a user who has no account means no public key exists to wrap the vault key for (handoff §19). The handoff explicitly forbids solving this with server-side key escrow.

## Decision

**Deferred wrap** ([sharing-protocol.md](../sharing-protocol.md) §4): the invitation exists without key material (`PENDING`); after the invitee signs up and accepts (`ACCEPTED`), the **owner's next unlocked session** wraps the current vault key to the invitee's now-existing public key, which activates membership (`ACTIVE`). The server's role is state-keeping and notification only.

## Consequences

- Invitee access waits for the owner to come online once after acceptance. Acceptable at V1 team sizes (1–20); both parties see honest "awaiting owner" status.
- Any current member could technically perform the wrap (they hold the vault key), but V1 restricts wrapping to **owners** — it is a membership-granting act, matching handoff §6's permission model.
- Vault-key rotation between invite and wrap is harmless: the wrap always targets the current generation at wrap time.
- No cryptographic or trust cost: the pattern is identical to Flow A, merely delayed.

## Alternatives rejected

- **Server-side escrow of the vault key for the invitee:** explicitly forbidden (handoff §19).
- **Invite-link containing key material (e.g. key in URL fragment):** secrets in URLs violate handoff §34.5; links leak via logs, history, and forwarding.
- **Ephemeral invitation keypair (wrap now to a keypair embedded in the invite email/link):** the email channel becomes a key-carrying channel — equivalent to sending secrets over email, the exact workflow this product replaces.
