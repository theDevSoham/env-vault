# ADR-008 — CLI runtime, distribution & local credential storage

**Status:** Accepted (Phase 1.5) · **Date:** 2026-07-23

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

- **Separate CLI package with copied crypto:** drift risk between two crypto implementations is exactly what the single-module rule exists to prevent.
- **OS keychain now:** three platform-specific native dependencies for V1; revisit in Phase 2.
- **Bun/pkg single binary now:** packaging polish, not security; deferred.
