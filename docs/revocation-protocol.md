# Env Vault — Revocation & Key Rotation Protocol

**Status:** Draft (Phase A)
**Depends on:** [crypto-spec.md](crypto-spec.md) §3 (key generations), [revision-model.md](revision-model.md)
**Sources:** handoff §20–21, §34.11

---

## 1. Guarantee (stated precisely)

> After a completed rotation, a removed member cannot decrypt any vault state created **after** the rotation. State they could decrypt **before** removal must be assumed retained by them forever (handoff §20–21, threat model N3).

Deleting the membership row alone is authorization-revocation only; it never counts as revocation on its own.

## 2. Actors

Rotation is performed by an **owner's client** (it needs the plaintext vault key and all remaining members' public keys). The server validates, stores, and commits atomically — it cannot perform any cryptographic step.

## 3. Protocol

Let the vault's current key generation be `g`.

**Client side (owner, unlocked session):**

1. Fetch: current membership list minus the removed member, their public keys (fingerprints displayed), the current revision of every environment in the vault, all secret-file stream envelopes, and all encrypted names.
2. Generate `vaultKey(g+1)` via CSPRNG.
3. Decrypt with `vaultKey(g)` and re-encrypt under `vaultKey(g+1)` (fresh nonces, updated `kid`, updated AAD where the AAD embeds nothing generation-specific — AADs bind ids/revision numbers, which do not change):
   - the **current** snapshot of every environment (as a new revision per environment, message: `"Vault key rotated"` — see §5),
   - all encrypted vault/environment/file names,
   - all secret files (re-encrypted as new streams; chunk re-upload).
4. Wrap `vaultKey(g+1)` for **every remaining member** (`enc.box` per member). No envelope for the removed member (handoff §20.5).
5. Submit one rotation commit: `{ vaultId, baseGeneration: g, removedMemberId, newEnvelopes[], newRevisions[] (one per environment, each with its base revision number), reEncryptedNames[], fileRewrites[] }`.

**Server side (single transaction — handoff §34.11):**

6. Validate: caller is owner; `baseGeneration == g` (reject if a concurrent rotation won); every remaining active member has exactly one new envelope; removed member has none; each new revision's base revision number matches that environment's head (reject on conflict → client refetches and redoes steps 1–5).
7. Atomically: bump vault generation to `g+1`, deactivate removed membership, insert envelopes, append revisions, swap name ciphertexts, activate file rewrites, append audit events (`member_removed`, `vault_key_rotated`).
8. On any failure: full rollback — the vault remains consistently at generation `g` with the member still (cryptographically) present. Removal is not observable until rotation succeeds.

## 4. Failure & concurrency handling

- **Interrupted client** (tab closed mid-rotation): nothing was committed; vault unchanged; owner retries. No partial state can exist because commit is one transaction.
- **Concurrent edits during rotation:** caught by the per-environment base-revision check in step 6 — rotation conflicts exactly like any revision commit and the client re-runs against fresh state (handoff §30 semantics).
- **Concurrent rotations:** `baseGeneration` check serializes them; loser retries.
- **Removed member online during rotation:** their session may still read generation-`g` ciphertext until commit; that is within the guarantee (§1). At commit their membership deactivates and all vault endpoints deny them (T4/T5).
- **Large vaults:** file re-encryption may be slow; the rotation commit is all-or-nothing regardless. If payload sizes ever force chunked commits, that design change requires review (handoff §34.16) — do not quietly weaken atomicity.

## 5. History across generations (handoff §21)

- Revisions ≤ rotation point remain encrypted at generation ≤ `g`. They are **not** re-encrypted (immutability; and the removed member already saw them — re-encrypting old history buys nothing, threat model N3).
- Remaining members keep their old-generation envelopes, so full history stays readable to them.
- New members: see [sharing-protocol.md](sharing-protocol.md) §5.
- The rotation writes a normal immutable revision per environment (same snapshot content, new key, new generation) so the head of every environment is always decryptable at the current generation and the audit trail shows exactly when rotation occurred.

## 6. What revocation does NOT do (document in product UI)

- Does not erase what the removed member already obtained (N3).
- Does not re-secure historical revisions against them.
- Does not protect against exports they made while authorized (N1/N4).
