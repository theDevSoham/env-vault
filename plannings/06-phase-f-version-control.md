# 06 — Phase F: Version Control

**Goal:** complete the revision experience — history, structural diffs, comparison, restore, conflicts (handoff §9–11, §28–30, §35 Phase F). Commit plumbing exists from D3/E4; this phase finishes the model and UI.

**Dependencies:** Phase E. **Blocks:** H.

## Steps

### F1. Revision history UI
- [ ] Per-environment revision timeline: number, actor, timestamp, optional message.
- [ ] Per-revision structural change view (decrypt diff metadata client-side): Added / Modified / Deleted / Renamed key names — **never values, never old→new** (handoff §9).

### F2. Revision comparison
- [ ] Compare any two revisions N → M (handoff §29): client decrypts both snapshots, computes structural diff locally (Phase B diff function).
- [ ] Rename detection semantics defined and documented (explicit rename op from the editor vs heuristic — prefer explicit).

### F3. Restore
- [ ] Restore revision K → creates new revision with K's state and message "Restored from Revision K" (handoff §28); history untouched.
- [ ] Restore across key generations: snapshot re-encrypted under the **current** vault key.

### F4. Concurrency polish
- [ ] Conflict UX: show what changed upstream (structural only), let user reapply staged changes onto latest.
- [ ] Automated test: interleaved commits from two clients produce a linear, gap-free revision sequence.

### F5. Atomic changesets verification
- [ ] Multi-operation edit (add + modify + delete in one commit) produces exactly one revision (handoff §11).

## Exit criteria

- [ ] MVP criteria #11, #12, #13 pass end-to-end.
- [ ] Diff/compare/restore all function with values concealed everywhere (UI + payloads + logs).
- [ ] Worklog entry written.
