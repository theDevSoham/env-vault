# Phase A — Security Design · Worklog · 2026-07-23

**Plan:** [plannings/01-phase-a-architecture.md](../plannings/01-phase-a-architecture.md) (all steps A1–A7 complete)

## What was done

Wrote the complete Phase A security design: 7 design documents and 5 ADRs. No application code (by design — handoff §35).

## Decisions made

| Decision | Outcome | Record |
|---|---|---|
| O1 crypto library | libsodium-wrappers + WebCrypto AES-GCM hybrid; XChaCha20 secretstream for files (documented deviation for streaming only) | ADR-001 |
| O2 auth strategy | First-party email+password; Argon2id master key split into authKey (login) + KEK (private-key encryption); no third-party auth | ADR-002 |
| O5 Argon2id params | 64 MiB, ops=3, 16 B salt, 32 B out; per-user stored, upgradable policy | ADR-003 |
| O6 metadata sensitivity | Vault/environment/file names encrypted under vault key; ids/timestamps/roles/states plaintext | ADR-004 |
| O7 pending invitations | Deferred wrap by owner's next unlocked session; no escrow, no key-in-link | ADR-005 |
| O8 CLI provisioning | Approach fixed (device auth + device-keypair wrap); full design still gated before Phase 1.5 | docs/cli-key-provisioning.md |
| O3 database / O4 storage | Explicitly deferred to Phase C step C1 | ARCHITECTURE.md §10 |

Design details worth noting (introduced this phase, beyond the handoff text):

- **Stable per-key random ids** inside snapshots → exact rename detection, no heuristics (crypto-spec §5).
- **AAD binding** of every ciphertext to vault/env/revision (or name/file) ids → anti-transplant protection against a tampering DB.
- **Key generations** on every envelope/payload; rotation writes a normal immutable revision per environment.
- **T9/L2 honesty:** server-side public-key substitution is a real residual risk; V1 mitigation = key fingerprints in UI (members and CLI devices); key transparency post-V1.
- **T10:** deterministic dummy KDF params for unknown emails to blunt user enumeration.
- Signup UX must carry the no-recovery warning (L1).

## Files touched

Created: `docs/threat-model.md`, `docs/crypto-spec.md`, `docs/account-key-lifecycle.md`, `docs/sharing-protocol.md`, `docs/revocation-protocol.md`, `docs/revision-model.md`, `docs/cli-key-provisioning.md`, `docs/decisions/adr-001…005`.
Updated: `docs/INDEX.md`, `ARCHITECTURE.md` (§9 decision log D7–D12, §10 shrunk to O3/O4), `plannings/01` (all checked, DONE), `plannings/INDEX.md` (01 → done).

## Verification

Documents cross-checked against handoff §3 (allowed/forbidden storage), §34 rules, and §36 threat scenarios; every T# maps to named defenses. No automated verification applies (docs only) — Phase H re-reviews all of this against the implementation.

## Follow-ups

- ADR decisions await user ratification — flagged in session summary; all are revisable before Phase B code exists.
- Phase B is next: implement `src/lib/crypto/` against crypto-spec §9 API, test-first.
- O3/O4 ADRs due in Phase C step C1.
- `docs/cli-key-provisioning.md` must be finalized + reviewed before any Phase 1.5 code.
