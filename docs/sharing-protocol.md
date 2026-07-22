# Env Vault — Sharing & Invitation Protocol

**Status:** Draft (Phase A)
**Resolves:** O7 (pending invitations, [ADR-005](decisions/adr-005-pending-invitations.md))
**Depends on:** [crypto-spec.md](crypto-spec.md) §3, [threat-model.md](threat-model.md) T9/L2

---

## 1. Principle

The vault key reaches a new member only as an `enc.box` envelope wrapped **by an existing member's client** to the invitee's public key (handoff §18). The server stores and routes envelopes; it can never produce or open one. No server-side key escrow exists in any state of this protocol (handoff §19).

## 2. Invitation states

```
created ──▶ PENDING ──(invitee accepts)──▶ ACCEPTED ──(owner client wraps key)──▶ ACTIVE
   │            │                              │
   │            ├──(owner revokes)──▶ REVOKED  ┤   (revoke allowed at any pre-ACTIVE state)
   │            └──(expiry passes)──▶ EXPIRED  ┘
```

- `PENDING` — invitation row exists (vault id, invitee email, role, expiry). **No key material attached.**
- `ACCEPTED` — invitee authenticated, has an account and published public key, and consented. Still cannot decrypt anything.
- `ACTIVE` — a `VaultKeyEnvelope` exists for the invitee for the current key generation; membership row live.

## 3. Flow A — invitee already has an account

1. Owner enters invitee email (+ role: Owner/Member).
2. Server confirms a user + public key exists; owner's client fetches invitee public key.
3. **Fingerprint step (T9 mitigation):** UI shows the invitee key fingerprint (short hash rendered as words/hex) so the two parties can compare out-of-band; proceeding without comparing is allowed but the fingerprint is always visible.
4. Owner client: `wrapVaultKey(vaultKey_currentGen, inviteePubKey)` → envelope uploaded with the invitation (state moves directly to a wrapped-pending variant).
5. Invitee accepts → server activates membership + envelope in one transaction → `ACTIVE`.
6. Audit: `member_invited`, `invitation_accepted`.

If the vault key rotates between steps 4 and 5, the envelope is stale: activation fails closed, and the owner's client re-wraps at generation-current on next session (same mechanism as Flow B).

## 4. Flow B — invitee has no account yet (deferred wrap, ADR-005)

1. Owner creates invitation → `PENDING`; email notification sent. **The email contains no vault name** (names are encrypted, and the recipient is not yet a member — threat model A7).
2. Invitee signs up (creates keypair per [account-key-lifecycle.md](account-key-lifecycle.md)) and accepts → `ACCEPTED`.
3. Next time the **owner's** client has an unlocked session, it sees pending-wrap work for the vault, fetches the invitee's public key (fingerprint shown), wraps the current-generation vault key, uploads the envelope → server activates membership → `ACTIVE`.
4. Invitee is notified access is ready.

The deferred-wrap latency (waiting for the owner to come online) is the accepted cost of zero escrow. The UI surfaces "awaiting owner approval/wrap" states to both parties honestly.

## 5. Multi-generation entitlement

A newly activated member receives envelope(s) for the **current** generation only. They can read all revisions encrypted at that generation and later. Older-generation revisions predate their membership; whether to grant them is the owner's choice (V1: owner client may additionally wrap older generation keys — default **on**, since vault-level access is the V1 model and handoff §6 gives members full vault access). This default is revisitable in Phase C without protocol changes.

## 6. Roles

Role (Owner/Member) is plaintext membership metadata enforced by the server's authorization layer. Cryptographically, both roles hold the same vault key — role enforcement is authorization, not encryption (consistent with handoff §4's boundary: an authorized member can always decrypt what they hold keys for).

## 7. Server responsibilities & limits

- Enforce: only vault owners create/revoke invitations; expiry (default 7 days) enforced server-side; single-use acceptance bound to the invited email's account.
- Store/route public keys and envelopes; serve them faithfully. **Key-substitution by a malicious server remains L2** — fingerprints are the V1 mitigation; key transparency is post-V1.
- Audit every transition (`member_invited`, `invitation_accepted`, `invitation_revoked`, plus activation).
