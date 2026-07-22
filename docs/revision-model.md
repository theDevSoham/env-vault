# Env Vault — Revision Encryption & Commit Model

**Status:** Draft (Phase A)
**Depends on:** [crypto-spec.md](crypto-spec.md) §5–6
**Sources:** handoff §9–11, §28–30; Decision D2 (full encrypted snapshots)

---

## 1. Model

- Revisions are **immutable and append-only**, numbered per environment starting at 1, no gaps.
- Every committed changeset produces exactly one revision (atomic changesets, handoff §11).
- Each revision stores a **full encrypted snapshot** (Decision D2) plus **encrypted structural diff metadata** vs. its parent (formats in crypto-spec §5–6).
- `Revision` record fields (handoff §11): id, vault id, environment id, revision number, actor, timestamp, key generation, optional plaintext message (never containing secret values — UI guidance + server length limits; the server cannot verify content, so product copy must warn), snapshot envelope, diff envelope.

## 2. Commit protocol (optimistic concurrency, handoff §30)

Client state: decrypted snapshot of head revision `n`, plus a locally staged changeset (adds/edits/deletes/renames by stable key `id`).

1. Client applies changeset to snapshot `n` → candidate snapshot; computes diff (`diffSnapshots`); encrypts both with AAD bound to revision number `n+1`.
2. `POST … { baseRevision: n, snapshotEnv, diffEnv, message? }`.
3. Server, transactionally: verify membership; verify environment head == `n`; insert revision `n+1`; update head; append `revision_created` audit event.
4. **Conflict** (head ≠ n): reject with the current head number. Client fetches and decrypts the newer snapshot(s), shows the upstream *structural* changes, lets the user reapply their staged changeset onto the new head, and re-commits. Never silently overwrite (handoff §30).

The unique `(environment, number)` constraint is the correctness backstop regardless of application logic.

## 3. Restore (handoff §28)

Restoring revision `k` while head is `n`:

1. Client decrypts snapshot `k` (any generation it holds envelopes for).
2. Re-encrypts that content **under the current vault key generation** with AAD for revision `n+1`.
3. Commits via the normal protocol with message `"Restored state from Revision k"` and a computed diff vs. `n`.

History is never deleted; restore is just a commit whose content happens to equal an older state.

## 4. Comparison (handoff §29)

Compare `a → b`: client decrypts both snapshots and diffs locally by stable key `id` (exact rename detection). Display added/removed/renamed/modified **names only**. The stored per-revision diff metadata covers the common parent-vs-child case without fetching two snapshots; arbitrary-pair comparison always recomputes locally.

## 5. Value-concealment rules (restating for implementers)

- Diff UI shows `DATABASE_URL — value changed`, never old/new values (handoff §9).
- Revision messages, audit events, and API error bodies never carry secret names in plaintext (names are inside encrypted diff metadata; messages are free text with UI warnings).
- The server can render **nothing** about a revision beyond number/actor/time/message — by construction, since both payloads are ciphertext.

## 6. Import

`.env` import (MVP #4) parses locally and stages a changeset like any edit; committing yields one revision ("Imported .env"). No file content reaches the server.
