# Prod Migration Runner · Worklog · 2026-07-23

**Trigger:** deployed API 500s on all DB endpoints; cause identified as the **prod database having no tables** — Vercel points at a different/empty Neon database than local `.env` (which had the migrated schema + 8 users). The improved 5xx logging (prior turn) surfaces this as `relation "users" does not exist`.

## What was added

- **`scripts/migrate.ts`** — standalone migration runner using `drizzle-orm/node-postgres/migrator` + `pg` only (no drizzle-kit needed at deploy time). Applies `./drizzle/*.sql` idempotently against `DATABASE_URL`.
- **`package.json` scripts:**
  - `db:migrate` = `tsx scripts/migrate.ts`
  - `db:generate` = `drizzle-kit generate`
  - `vercel-build` = `tsx scripts/migrate.ts && next build` — runs migrations before the build on Vercel, **without** affecting local `npm run build`.
- All 5 migration SQL files + `drizzle/meta/_journal.json` are committed, so they're present during the Vercel build.

## Verified

- `npm run db:migrate` against local DB → "✓ Migrations up to date" (idempotent; skips already-applied).
- tsc/lint clean.

## How prod gets migrated

- **Immediate (guaranteed):** run once from local against the prod DB —
  `$env:DATABASE_URL="<prod url>"; npm run db:migrate` (PowerShell). Get the prod URL from Vercel env vars or `vercel env pull`.
- **Automated pre-deploy:** the `vercel-build` script migrates on every deploy. If Vercel's Next preset ignores `vercel-build`, set the **Build Command** in Vercel → Settings → Build & Development to `npm run db:migrate && npm run build`. Requires `DATABASE_URL` available at **build** time.

## Notes

- Migrations run at build time (before new code is live) — correct ordering for our additive/append-only migrations.
- Idempotent, so preview deploys re-running it are harmless.
- Combined with prior fixes (`force-dynamic` for CSP, `serverExternalPackages` for libsodium, `DATABASE_URL`/`SERVER_SECRET` env vars), this should make the deployed API healthy.
