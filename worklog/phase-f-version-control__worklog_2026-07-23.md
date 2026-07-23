# Phase F — Version Control · Worklog · 2026-07-23

**Plan:** [plannings/06-phase-f-version-control.md](../plannings/06-phase-f-version-control.md) (F1–F5 complete)

## What was done

Completed the version-control experience on top of the E4 editor: arbitrary-revision comparison, restore-as-new-revision, and a real conflict-rebase UX. Added 4 integration tests that push **real crypto** (not fake envelopes) through the API handlers.

## Implementation notes

- **Flows** (`src/lib/client/flows.ts`): `loadHeadSnapshot` generalized to `loadSnapshot(vaultId, envId, n)` (0 = empty state); new `compareRevisions` (both snapshots decrypt locally, diff computed client-side — handoff §29) and `restoreRevision` (commits target content on top of current head with message "Restored state from Revision K" and `restoredFromRevision` for the audit type — handoff §28; always re-encrypts at the current key generation).
- **Conflict rebase** (`SecretsEditor`): on 409 the editor stores the staged ops in a ref, reloads at the server-reported head, re-applies ops onto the fresh base (match by stable key id, fallback original name; ops on upstream-deleted keys dropped), and shows a notice including the **decrypted upstream changes** ("Their changes: +X ~Y"). Previously staged edits were silently lost on conflict — that gap is closed.
- **History panel** (`app/vaults/[vaultId]/env/[envId]/page.tsx`): compare picker (two selects → client-side diff banner), per-revision Restore button (hidden on head) with history-preserving semantics; editor remounts via an epoch key after restore.
- Rename detection remains **explicit via stable ids** (F2's "prefer explicit" decision) — the editor preserves `id` across renames, so rename+modify is reported exactly.

## Verification

- **Integration tests** (`versioncontrol.integration.test.ts`, real crypto through handlers): F5 multi-op changeset → exactly one revision; F4 two-client interleave → 409 with `currentHead`, rebase, recommit → gap-free [1,2,3] and the rebased diff decrypts to exactly the intended delete; F2 rename+modify via stable id → `renamed: [DATABASE_URL→DB_URL]` + `modified: [DB_URL]`; F3 restore → revision 5 content equals revision 1 exactly, all 5 revisions listed.
- **Browser** (dev server + browser pane, continuing the Phase E account): committed rev 2 (+REDIS_URL) → Compare 1→2 rendered `+ REDIS_URL` → Restore rev 1 → rev 3 created with message and `− REDIS_URL` diff, revisions 1–2 intact, editor remounted at head 3. Values nowhere in the DOM.
- Suite: 88/88; `tsc`, lint, `next build` clean.
- Honest gap: the conflict-rebase **UI path** is exercised by unit-level logic + API tests, not by a two-browser-session simulation; the protocol path is fully covered by the interleave test.

## Files touched

Created: `src/lib/api-server/__tests__/versioncontrol.integration.test.ts`.
Updated: `src/lib/client/flows.ts` (loadSnapshot/compareRevisions/restoreRevision), `src/components/SecretsEditor.tsx` (rebase + upstream summary), `app/vaults/[vaultId]/env/[envId]/page.tsx` (compare + restore UI), plannings.

## Follow-ups

- MVP #11–#13 now demonstrably pass. Remaining before security review: Phase G (export UI — serializers ready in `envformat.ts`).
- A stale dev-server process had survived an earlier `preview_stop` and held port 3000 (killed this session) — worth remembering if the preview ever fails to start.
