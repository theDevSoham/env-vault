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

## Notes / follow-ups

- Once published, the Devices-page copy ("Run `envvault login`") is literally correct via `npm i -g envvault`. Until then it's forward-correct but a user without the package can't run it; an optional "don't have it? `npm i -g envvault`" hint on the page was offered but not added (user scoped this to publish-prep only).
- Device-login smoke tests were killed before browser approval, so they left only short-lived `pending` grants (10-min expiry) — no cleanup needed.
- Set the real repo/homepage URLs in `cli/package.json` before an actual publish; pick the npm name (`envvault` may be taken — verify availability).
