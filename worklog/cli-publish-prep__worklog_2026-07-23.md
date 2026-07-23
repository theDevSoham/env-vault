# CLI Publish-Prep · Worklog · 2026-07-23

**Trigger:** the Devices page tells users to run `envvault login`, but no such command existed — the CLI only ran as `npm run cli -- …` from the repo. User chose "prep for npm publish (stop short of publishing)".
**Decision record:** [ADR-008 §Distribution update](../docs/decisions/adr-008-cli-runtime.md).

## What was done

Made the CLI an **npm-publishable package** without publishing it, and — importantly — **without unsetting `private` on the root package** (that's the Next.js web app; publishing it would ship the whole app). The publishable unit is a separate `cli/package.json` (`name: envvault`) that bundles the shared crypto in at build time.

- `cli/package.json`: `name: envvault`, `bin: { envvault: dist/envvault.js }`, `dependencies: libsodium-wrappers-sumo@0.8.4` only, `files: [dist, README.md]`, `engines: node>=20`, `prepack` that rebuilds the bundle.
- Root `scripts.build:cli`: esbuild bundle of `cli/index.ts` → `cli/dist/envvault.js` (CJS, node20), `libsodium` external, source shebang preserved. Import surface confirmed clean (crypto + envformat + node builtins; no db/server-only/pg/Next).
- `cli/README.md` (install, auth, commands, CI/service-account usage, security notes).
- `cli/dist` gitignored; `esbuild` added as a dev-dependency.

## Verification

- Bundle builds to ~20 KB; single shebang (fixed an initial double-shebang from banner + source — dropped the banner, esbuild preserves the entry shebang).
- Bundled binary runs: `--help` renders; `login` generates a keypair + fingerprint against the live server (proves libsodium loads from the external dep in the built artifact).
- `npm pack --dry-run` → clean 3-file tarball (README, dist, package.json); `prepack` auto-rebuilds.
- **Install test (the real proof):** packed the tarball, `npm i` into a throwaway project, ran the installed `./node_modules/.bin/envvault` — help works and `login` runs crypto using the package's **own** resolved libsodium (not the repo's). npm created the `envvault` / `.cmd` / `.ps1` shims.
- Root still `private: true`; lint clean; 98 tests green.
- **Not published** — publishing stays a manual `cd cli && npm publish`.

## Metadata & LICENSE (done — follow-up completed same day)

- Confirmed the npm name **`envvault` is available** (registry 404).
- Filled `cli/package.json`: `author` (Soham Das <publicsoham.24@gmail.com>), `repository` (git+https://github.com/theDevSoham/env-vault.git, `directory: "cli"`), `homepage`, `bugs` — all pulled from the real git remote/config, not invented.
- Added `cli/LICENSE` (MIT, © 2026 Soham Das) and wired `LICENSE` into `files`. Fixed the placeholder repo link in `cli/README.md`.
- `npm pack --dry-run` now ships a 4-file tarball: LICENSE, README.md, dist/envvault.js, package.json. Metadata validates.

## Remaining before an actual publish (not blockers I can fix in-repo)

- **No hosted backend** — the CLI defaults to `http://localhost:3000`; Env Vault isn't deployed publicly, so an installed CLI has nothing real to point at. Publish only once a server exists (and give `--server` a real default or require it). **This is the gating item.**
- Publishing is a manual, outward-facing `cd cli && npm publish` (needs the owner's npm auth) — intentionally not done here.
- Optional: add a "don't have it? `npm i -g envvault`" hint to the Devices page (offered, not done — scoped to publish-prep).

## Notes

- Device-login smoke tests were killed before browser approval, so they left only short-lived `pending` grants (10-min expiry) — no cleanup needed.
