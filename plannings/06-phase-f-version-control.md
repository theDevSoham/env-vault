# 06 — Phase F: Version Control

**Status: DONE (2026-07-23)** — see [worklog/phase-f-version-control__worklog_2026-07-23.md](../worklog/phase-f-version-control__worklog_2026-07-23.md)

**Goal:** complete the revision experience — history, structural diffs, comparison, restore, conflicts (handoff §9–11, §28–30, §35 Phase F). Commit plumbing exists from D3/E4; this phase finishes the model and UI.

**Dependencies:** Phase E. **Blocks:** H.

## Steps

### F1. Revision history UI
- [x] Per-environment timeline (number, timestamp, key generation, message) — built in E4, retained.
- [x] Per-revision structural change view from client-decrypted diff metadata: added / modified / renamed / deleted key **names only**, never values or old→new (handoff §9).

### F2. Revision comparison
- [x] Compare any two revisions N → M (`compareRevisions` flow + history-panel picker): both snapshots decrypt locally, `diffSnapshots` runs client-side; nothing plaintext touches the server (handoff §29).
- [x] Rename semantics: **explicit via stable key ids** (editor renames preserve the id) — exact detection, no heuristics; rename+modify reported as both. Verified by integration test.

### F3. Restore
- [x] `restoreRevision` flow + per-revision Restore button: restoring K creates revision head+1 with K's content and message "Restored state from Revision K"; history untouched (handoff §28).
- [x] Cross-generation correctness: restored snapshot is re-encrypted under the **current** vault key generation (commit path always encrypts at current gen).

### F4. Concurrency polish
- [x] Conflict UX (handoff §30): on 409 the editor now (a) decrypts and shows the upstream revisions' structural changes ("Their changes: +X ~Y"), (b) **preserves the user's staged ops and re-applies them onto the new head** (rebase by stable id/name; ops on upstream-deleted keys are dropped), (c) user reviews and commits again. Never silently overwrites.
- [x] Automated interleaved-commit test (real crypto through API handlers): client 1 commits, client 2 conflicts at 409+currentHead, rebases, recommits → linear gap-free sequence [1,2,3] with correct decrypted diffs.

### F5. Atomic changesets verification
- [x] Multi-operation commit produces exactly one revision (integration test + browser use).

## Exit criteria

- [x] MVP criteria #11, #12, #13 pass end-to-end (revisions immutable & linear; diffs identify added/removed/renamed/modified without values; restore preserves history).
- [x] Verified in a real browser: committed rev 2 (+REDIS_URL), compared 1→2 (diff rendered client-side), restored rev 1 → rev 3 with "−REDIS_URL" diff and full history retained; values appear nowhere.
- [x] Suite: 88 tests green (4 new Phase F integration tests with real crypto); tsc/lint/build clean.
- [x] Worklog entry written.
