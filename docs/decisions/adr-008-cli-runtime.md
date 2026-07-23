# ADR-008 — CLI runtime, distribution & local credential storage

**Status:** Accepted (Phase 1.5); **distribution amended** (publish-prep, 2026-07-23) — see §Distribution update.

## Context

The CLI must reuse the reviewed crypto module byte-for-byte (no re-implementation drift), run on developer machines (win/mac/linux), and store a device credential at rest ([cli-key-provisioning.md](../cli-key-provisioning.md) §4).

## Decision

- **Runtime: Node ≥ 20**, TypeScript, living in `cli/` inside this repo and importing `src/lib/crypto` and `src/lib/client/envformat` directly — the exact modules the web client uses (Node 20 provides the WebCrypto global the record layer needs; libsodium-wasm runs unchanged).
- **Distribution V1: repo-local script** — `npm run cli -- <command…>` (tsx). An npm-published `envvault` bin (tsc build) is the packaging step when the product ships publicly; single-binary (pkg/bun) deferred.
- **Credential storage V1: `~/.envvault/credentials.json` chmod 0600**, containing device private key + wrapped user-key envelope + bearer token; the user private key is never written unwrapped. OS-keychain integration is the planned Phase 2 upgrade — see the provisioning doc §4 for the documented trade-off (this deviates from the Phase A sketch explicitly, not silently).

## Consequences

- Zero crypto duplication: CLI and web client share one implementation and its test suite/vectors by construction.
- `tsx` joins dev-dependencies (dev-only; not a production server dependency).
- Windows file-ACL limitation documented to users at `login` time.

## Alternatives rejected

- **Separate CLI package with copied crypto:** drift risk between two crypto implementations is exactly what the single-module rule exists to prevent. *(Superseded — see distribution update: the CLI is now a separate package that **bundles the shared crypto source at build time**, so there is still one source of truth; no hand-copied crypto.)*
- **OS keychain now:** three platform-specific native dependencies for V1; revisit in Phase 2.
- **Bun/pkg single binary now:** packaging polish, not security; deferred.

## Distribution update (publish-prep, 2026-07-23)

The web UI's Devices page instructs users to run `envvault login`, but no such command existed — the CLI only ran as `npm run cli -- …` from the repo. To close that gap the CLI is made **npm-publishable as its own package**, stopping short of an actual publish.

- **Separate publishable package `cli/package.json`** (`name: "envvault"`, `bin`, `dependencies: libsodium-wrappers-sumo` only). The **root package stays `private: true`** — it is the Next.js web app and must never be published; only the CLI is a distributable artifact.
- **Build: esbuild bundle** (`npm run build:cli`) → `cli/dist/envvault.js` (CJS, Node 20, shebang preserved from source), bundling `cli/` + the imported `src/lib/crypto` and `src/lib/client/envformat` into one file, with `libsodium-wrappers-sumo` kept **external** (installed as a declared dependency). This preserves "one crypto source" — the same source is bundled at build time, not re-implemented. The CLI's import surface is crypto + envformat + node builtins only (no db/server-only/pg/Next).
- **`prepack`** rebuilds the bundle so `npm publish`/`npm pack` from `cli/` can never ship a stale/missing `dist/`. `cli/dist` is gitignored (build artifact).
- Verified: `npm pack --dry-run` → 3-file tarball (README, dist, package.json); installed from the tarball into a clean project, the `envvault` bin runs and its bundled crypto generates a keypair + device fingerprint against a live server. **Not published** — that stays a manual `cd cli && npm publish` step.
- `esbuild` joins dev-dependencies (build-only). Once published, the Devices-page copy ("Run `envvault login`") becomes literally correct via `npm i -g envvault`.
