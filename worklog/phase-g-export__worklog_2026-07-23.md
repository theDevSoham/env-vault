# Phase G — Export · Worklog · 2026-07-23

**Plan:** [plannings/07-phase-g-export.md](../plannings/07-phase-g-export.md) (G1–G3 complete)

## What was done

Wired client-side export end-to-end. The serializers already existed (Phase E, `envformat.ts`, round-trip-tested); this phase added the `exportEnvironment` flow (decrypt head snapshot in memory → serialize → local Blob download; best-effort `export_requested` audit event that never blocks the export), the two download buttons on the environment page with the plaintext-copy honesty notice, and disabled state at revision 0.

## Verification (browser)

- Hooked `URL.createObjectURL` in the live app and captured both generated files: `.env` = `DATABASE_URL=postgres://db.internal/dev\nJWT_SECRET=super-jwt-secret-value\n`, JSON = the flat-object equivalent — exactly the decrypted head (restored revision 3) state.
- **Network trace during both exports:** only ciphertext GETs (vault detail, revision 3) + two POSTs to `/audit/export` whose bodies are schema-limited to `{environmentId, format}`. Zero plaintext left the browser (MVP #16).
- MVP #14/#15/#16 verified; roadmap checklist updated — all V1 features checked, MVP #1–#17 checked, #18/#19 deliberately left for Phase H's formal review.

## Files touched

Updated: `src/lib/client/flows.ts` (+`exportEnvironment`), `app/vaults/[vaultId]/env/[envId]/page.tsx` (export buttons + notice + `doExport`), `plannings/07` (DONE), `plannings/00-roadmap.md` (checklists), `plannings/INDEX.md`.

## Follow-ups

- Phase H — security review — is the only remaining V1 phase. Everything it needs is in place: threat model to re-walk, CSP exceptions to revisit (`style-src 'unsafe-inline'`, dev `unsafe-eval`), dependency review (drizzle-kit's deprecated transitive deps, npm audit findings), the `server-only` guard question, and formal sign-off on MVP #18/#19.
