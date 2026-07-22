# ENV VAULT — ARCHITECTURE PLAN

**Status:** Draft v0.1 (pre-implementation)
**Source of truth for requirements:** [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)
**Last updated:** 2026-07-23

This document translates the handoff requirements into a concrete technical architecture. Where the handoff leaves a decision open, it is recorded in §9 (Decision Log) or §10 (Open Decisions). Coding agents must not silently resolve an open decision — surface it first (handoff §34.17).

---

## 1. System Overview

Env Vault is a zero-knowledge secrets storage and sharing platform. The single invariant that governs every design decision:

> The infrastructure stores secrets. The authorized client understands them.

```
┌─────────────────────────── TRUSTED ───────────────────────────┐
│  Web Client (browser)              CLI (local machine)        │
│  - key derivation (Argon2id)       - local key storage        │
│  - all encrypt/decrypt             - all encrypt/decrypt      │
│  - diff computation                - export / run injection   │
│  - export generation                                          │
└───────────────┬───────────────────────────┬───────────────────┘
                │  TLS (encrypted payloads only)
┌───────────────▼───────────────────────────▼───────────────────┐
│                        UNTRUSTED (server)                     │
│  Next.js backend (route handlers)                             │
│  - authentication coordinator      - membership manager       │
│  - authorization layer             - audit-event store        │
│  - encrypted blob storage          - sync / concurrency       │
│  Database (encrypted payloads + metadata)                     │
│  Object storage (encrypted files only)                        │
└───────────────────────────────────────────────────────────────┘
```

The server never receives: plaintext secrets, plaintext files, master keys, unencrypted private keys, or passwords. See handoff §3 for the full allowed/forbidden storage lists.

## 2. Cryptographic Architecture

### 2.1 Primitives

| Purpose | Primitive | Notes |
|---|---|---|
| Password KDF | Argon2id | Unique random salt per user; parameters stored alongside, versioned, upgradable (handoff §14) |
| Symmetric AEAD | AES-256-GCM | Unique nonce per operation; nonce reuse forbidden (handoff §15) |
| Asymmetric identity | X25519 | Key agreement / envelope wrapping (handoff §13); signing keys deferred |
| Randomness | CSPRNG only | `crypto.getRandomValues` / libsodium |

All crypto lives in one reviewed module (planned: `src/lib/crypto/`). Application code never assembles primitives directly.

### 2.2 Key Hierarchy

```
Password ──Argon2id──▶ Password-Derived Key (PDK)
                            │ decrypts
                            ▼
                   User Private Key (X25519)  ◀── public half stored on server
                            │ unwraps
                            ▼
                   Vault Key (random 256-bit, per vault)
                            │ encrypts
                            ▼
        Environment snapshots, secret names + values, secret files
```

- **Vault Key** is generated client-side by CSPRNG at vault creation, then wrapped (encrypted) per member using each member's public key. The server stores only wrapped envelopes (handoff §16–17).
- **Sharing** = wrap Vault Key for invitee's public key, client-side (handoff §18–19).
- **Revocation** = remove membership + rotate Vault Key + re-wrap for remaining members + re-encrypt current state, atomically. Guarantees future confidentiality only (handoff §20–21).

### 2.3 Envelope Format

Every ciphertext is stored in a versioned envelope so algorithms can be migrated (handoff §34.15):

```json
{
  "v": 1,
  "alg": "A256GCM",
  "nonce": "<base64>",
  "ct": "<base64>",
  "kid": "<vault-key id / rotation generation>"
}
```

Exact schema is finalized in Phase A ([plannings/01-phase-a-architecture.md](plannings/01-phase-a-architecture.md)).

### 2.4 Secrecy Model

**Decision: Model B — encrypt both secret key names and secret values** (handoff §12, recommended). Consequences the whole codebase must respect:

- Server cannot search or diff secrets — the client computes structural diffs and uploads *encrypted* diff metadata.
- Search is client-side.
- Plaintext allowed server-side: vault names¹, environment names¹, revision numbers, actor ids, timestamps, membership, invitation state. (¹ sensitivity to be confirmed in Phase A threat model.)

## 3. Domain Model

```
User ─── VaultMembership ───┐
                            ▼
Vault ── Environments ── Revisions (immutable, append-only)
     ├── SecretFiles
     ├── VaultKeyEnvelopes (one per member, per key generation)
     ├── Invitations
     └── AuditEvents
```

Planned persistence entities (handoff §35 Phase C): `User`, `UserKey`, `Vault`, `VaultMembership`, `VaultKeyEnvelope`, `Environment`, `Revision`, `EncryptedPayload`, `SecretFile`, `Invitation`, `AuditEvent`.

### 3.1 Revision Model

- Immutable, append-only; every committed changeset = one new revision (handoff §10–11).
- **Decision: full encrypted snapshots** per revision (not deltas) for V1.
- Restore = new revision containing old state; history is never deleted (handoff §28).
- Optimistic concurrency: commits carry the base revision number; server rejects on conflict, client rebases (handoff §30).
- Structural change metadata (added/removed/renamed/modified key *names*) is computed client-side and stored encrypted; the UI decrypts it to render diffs. Values never appear in diffs, messages, or audit events.

### 3.2 Roles

Vault-level only: **Owner** (manage vault/members/environments + all member abilities) and **Member** (read/modify/export secrets and files). No per-secret ACLs in V1 (handoff §6).

## 4. Application Architecture (Web, Next.js 16)

> ⚠ Next.js 16 has breaking changes vs. training data. Read `node_modules/next/dist/docs/` before writing any code (see [AGENTS.md](AGENTS.md)).

Planned layout (to be created during Phases C–E):

```
app/                      # routes (App Router)
  (auth)/                 # sign-up / sign-in / unlock
  (vault)/                # vault list, vault detail, environments, revisions
  api/                    # route handlers: auth, vaults, envs, revisions, files, invites, audit
src/
  lib/crypto/             # THE crypto module — sole owner of primitives
  lib/api/                # typed client for backend endpoints
  lib/db/                 # DB schema + data access (server only)
  lib/storage/            # object-storage adapter (encrypted blobs only, server)
  components/             # UI components (no crypto logic inside components)
  state/                  # client key/session state (in-memory only for key material)
```

Hard rules for the web client (handoff §26, §36-XSS):

- Plaintext secrets and key material live **in memory only** — never localStorage/IndexedDB, never analytics/logging, never sent back to the server.
- Strict Content Security Policy; no third-party scripts on pages that touch key material.
- No "Reveal secret" UI. Retrieval = local export to `.env` / JSON only (handoff §7–8).

## 5. Backend Responsibilities

Route handlers implement: authentication, per-vault authorization, encrypted blob CRUD, revision append + conflict detection, membership/invitation lifecycle, key-rotation commit (atomic), audit-event append. The backend never decrypts, never generates exports, never logs request bodies of secret-carrying endpoints (handoff §27).

Authentication tokens are strictly separate from encryption keys; a compromised auth layer must not yield plaintext (handoff §23, §34.14).

## 6. CLI (Phase 1.5 — designed now, built later)

First-class architectural requirement (handoff §24–25): `envvault login` via browser/device-authorization flow (no passwords on argv), `vault list`, `env list`, `pull --format env|json`, later `run -- <cmd>` with in-memory injection. CLI key provisioning needs its own security design **before** implementation — tracked in [plannings/09-phase-cli.md](plannings/09-phase-cli.md).

## 7. Threat Model (summary — full version to be produced in Phase A)

Must defend against: database compromise, object-storage compromise, backend read access, unauthorized users, removed members (post-rotation), network attackers (TLS mandatory), logging/analytics leakage, and **XSS (highest-priority risk — crypto runs in the browser)**. See handoff §36.

Explicit non-goals (never claim otherwise): malware on user devices, authorized users copying exports, former members retaining previously accessed secrets (handoff §4, §37).

## 8. Implementation Phases

Order is mandated by handoff §35. Concrete task breakdowns live in [plannings/](plannings/INDEX.md):

| Phase | Scope | Plan file |
|---|---|---|
| A | Threat model, trust boundaries, envelope formats, protocols | `plannings/01-phase-a-architecture.md` |
| B | Isolated crypto prototype + tests (no DB) | `plannings/02-phase-b-crypto-prototype.md` |
| C | Data model | `plannings/03-phase-c-data-model.md` |
| D | Backend APIs (authz + encrypted storage) | `plannings/04-phase-d-backend.md` |
| E | Web client crypto layer + UI | `plannings/05-phase-e-web-client.md` |
| F | Version control (revisions, diffs, conflicts, restore) | `plannings/06-phase-f-version-control.md` |
| G | Client-side export (.env / JSON) | `plannings/07-phase-g-export.md` |
| H | Security review | `plannings/08-phase-h-security-review.md` |
| 1.5 | CLI | `plannings/09-phase-cli.md` |

## 9. Decision Log

| # | Decision | Rationale | Source |
|---|---|---|---|
| D1 | Encrypt secret names AND values (Model B) | Stronger zero-knowledge; handoff recommends; do not downgrade | Handoff §12 |
| D2 | Full encrypted snapshots per revision | Simpler restore/sync/crypto reasoning for V1 | Handoff §10 |
| D3 | Argon2id / AES-256-GCM / X25519 | Handoff-recommended primitives | Handoff §13–15 |
| D4 | Vault-level roles only (Owner/Member) | V1 scope | Handoff §6 |
| D5 | No secret-reveal UI; export-only retrieval | Product security posture | Handoff §7 |
| D6 | Revocation = key rotation, future-only guarantee | Cryptographic reality, documented honestly | Handoff §20–21 |

## 10. Open Decisions (must be resolved in Phase A — do not pick silently)

| # | Question | Options / notes |
|---|---|---|
| O1 | Crypto library | libsodium-wrappers (has Argon2id + X25519 sealed boxes) vs WebCrypto + argon2 WASM. WebCrypto lacks Argon2id and X25519-sealed-box out of the box. |
| O2 | Authentication provider/strategy | Roll-own credentials + verifier (e.g. SRP/OPAQUE-style) vs Auth.js vs managed auth. Must keep auth secrets separate from encryption keys. |
| O3 | Database + ORM | e.g. Postgres + Prisma/Drizzle. Needs atomic multi-row commits for key rotation. |
| O4 | Object storage provider | S3-compatible; receives encrypted bytes only. |
| O5 | Argon2id parameters | Memory/iterations/parallelism for browser targets; documented rationale required. |
| O6 | Are vault/environment *names* sensitive? | Decide plaintext vs encrypted in Phase A threat model. |
| O7 | Pending invitations to users without accounts | No server-side key escrow permitted; design deferred-wrap flow. |
| O8 | CLI key provisioning | Separate secure design required before CLI work. |
