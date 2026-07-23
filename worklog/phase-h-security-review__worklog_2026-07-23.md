# Phase H — Security Review · Worklog · 2026-07-23

**Plan:** [plannings/08-phase-h-security-review.md](../plannings/08-phase-h-security-review.md) (H1–H8 complete)
**Findings log:** [docs/security-review-v1.md](../docs/security-review-v1.md)

## What was done

Ran the full H1–H8 review. Seven findings fixed in-phase (SR-1…SR-7), four risks accepted with written rationale, threat model re-walked with no divergence, and MVP criteria #18/#19 formally signed off — **all 19 MVP criteria now pass; V1 is complete.**

## Fixes landed this phase

- **SR-1** `server-only` import guard on `src/lib/db/client.ts` (accidental client-component import = build error); vitest aliases the package to a stub.
- **SR-2** Login timing oracle closed: unknown emails now verify against a dummy Argon2id verifier — measured ~0.51s vs ~0.53s (previously unknown emails returned near-instantly, leaking account existence).
- **SR-3** Missing `SERVER_SECRET` is now a hard error in production (ephemeral fallback would rotate dummy KDF salts per restart — an enumeration signal). Dev fallback unchanged.
- **SR-4** All API responses (JSON + file chunks) now send `Cache-Control: no-store` + `X-Content-Type-Options: nosniff` (verified live via curl).
- **SR-5** `libsodium-wrappers-sumo` pinned exact (`0.8.4`) per ADR-001.
- **SR-6** README replaced with honest product copy (guarantee + explicit non-claims per handoff §4/§37).
- **SR-7** `images.unoptimized: true` — removes sharp (open libvips CVEs) from every runtime path; next/image is unused.

## Accepted risks (with rationale, in the findings log)

`style-src 'unsafe-inline'` CSP exception; signup `email_taken` enumeration; in-memory rate limiter (single-instance V1); postcss/drizzle-kit transitive advisories (build/dev-time only); lazy session-row GC; expired-invitation display cosmetics.

## Verification

- Sweeps: injection sinks 0 hits; browser-storage APIs 0 hits outside comments; primitives confined to crypto module; guard-count audit across 25 routes (only the 4 public auth endpoints guard-free, all rate-limited); all 13 audit call sites metadata-only.
- Suite 88/88 green after all fixes; tsc/lint/`next build` clean; live header + timing verification against the dev server.
- Note: a stale dev-server process again survived `preview_stop` and held port 3000 (second occurrence — killed by PID after verifying its command line).

## Files touched

Created: `docs/security-review-v1.md`, `vitest.server-only-stub.ts`.
Updated: `src/lib/db/client.ts` (+server-only), `app/api/auth/login/route.ts` (timing), `src/lib/api-server/dummykdf.ts` (prod guard), `src/lib/api-server/http.ts` + chunk route (headers), `next.config.ts` (images), `README.md`, `package.json` (+server-only, libsodium pinned), `vitest.config.ts` (alias), `docs/threat-model.md` (status → Reviewed), `docs/INDEX.md`, `plannings/00` (#18/#19 + V1-complete banner), `plannings/08`, `plannings/INDEX.md`.

## Follow-ups

- **V1 is done.** Next milestone is Phase 1.5 (CLI) — gated on finalizing `docs/cli-key-provisioning.md` (CLI-1) before any code.
- Deploy-time items to remember: set `SERVER_SECRET`, TLS termination, shared-store rate limiter if multi-instance, monitor Next releases for the postcss/sharp advisories, and rotate the Neon password (credential appeared in chat during setup).
