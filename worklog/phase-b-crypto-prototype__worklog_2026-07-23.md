# Phase B — Crypto Prototype · Worklog · 2026-07-23

**Plan:** [plannings/02-phase-b-crypto-prototype.md](../plannings/02-phase-b-crypto-prototype.md) (B1–B4 complete)

## What was done

Implemented the complete isolated crypto module `src/lib/crypto/` against [docs/crypto-spec.md](../docs/crypto-spec.md), test-first, with 53 passing tests across 7 files. No database, UI, or network code — pure library + Vitest.

## Module layout

| File | Responsibility |
|---|---|
| `index.ts` | Public API — the only import surface for consumers |
| `errors.ts` | Typed `CryptoError` hierarchy; messages contain no secret material by construction |
| `sodium.ts` | libsodium loader, base64url, UTF-8, CSPRNG — sole randomness source |
| `envelope.ts` | `enc.rec` / `enc.box` / `enc.stream` types + strict validation (unknown v/t/alg → hard error) |
| `aad.ts` | All AAD/kid builders — application code never hand-writes bindings |
| `record.ts` | AES-256-GCM via WebCrypto; module-internal 12-byte CSPRNG nonces |
| `kdf.ts` | Argon2id (`deriveMaster`), policy v1 constant, domain-separated `splitMaster` → KEK + authKey |
| `keys.ts` | X25519 keypairs, KEK-encrypted private keys, vault key generate/wrap/unwrap (sealed boxes) |
| `snapshot.ts` | Snapshot + structural-diff encrypt/decrypt; `diffSnapshots` by stable key id |
| `names.ts` | Encrypted vault/env/file display names (ADR-004) |
| `files.ts` | Chunked secretstream file encryption; FINAL-tag truncation detection |

## Decisions made

- **libsodium-wrappers-sumo**, not the standard build — standard omits `crypto_pwhash` (Argon2id). ADR-001 and crypto-spec §1 amended.
- **Private-key AAD** `privkey:<user-id>` added (spec had no AAD defined for `encPrivKey`); prevents replaying one user's encrypted private key under another user record. Spec §7 amended. Tested.
- Test suite uses deliberately weak Argon2id params for speed (marked never-copy in `__tests__/helpers.ts`); real policy v1 (64 MiB/ops 3) is exercised once in kdf.test.ts.

## Verification

- `npm test`: 53/53 pass (~3 s). Coverage includes: tamper detection (ct/nonce/AAD/sealed box/stream chunk), AAD anti-transplant (env/revision/vault and a grafted-aad-label attack), wrong-key/wrong-password failures, full sharing flow, full revocation flow (removed member locked out of gen-2, remaining member reads all history, retained-key reality documented as N3), restoration across generations, KDF-upgrade/password-change flow, nonce uniqueness (2000 ops), no-plaintext-leak scans, and an automated **module isolation test** (imports restricted to siblings + libsodium; zero `console.` calls).
- `npx tsc --noEmit`: clean. `npm run lint`: clean.

## Files touched

Created: `src/lib/crypto/*` (11 source files), `src/lib/crypto/__tests__/*` (7 test files + helpers), `vitest.config.ts`.
Updated: `package.json` (deps: libsodium-wrappers-sumo, vitest; script: `test`), `docs/crypto-spec.md` (sumo note, privkey AAD), `docs/decisions/adr-001-crypto-library.md` (sumo note), `AGENTS.md` (crypto path no longer "planned"), `plannings/02` (DONE), `plannings/INDEX.md`.

## Follow-ups

- Pre-existing `npm audit` findings (postcss/sharp inside Next 16's own tree) — not introduced by this phase; revisit at Phase H dependency review (H6).
- Browser-environment smoke test of the module (wasm init, WebCrypto, real-policy KDF timing on real devices) belongs to Phase E1.
- Phase C is next: resolve O3 (DB+ORM) and O4 (object storage), then schema + data-access layer.
