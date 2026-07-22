# Env Vault — Threat Model

**Status:** Draft (Phase A) — requires review in Phase H
**Sources:** [PROJECT_HANDOFF.md](../PROJECT_HANDOFF.md) §3–4, §23, §26–27, §36–37; [ARCHITECTURE.md](../ARCHITECTURE.md)

---

## 1. Assets

| # | Asset | Sensitivity |
|---|---|---|
| A1 | Secret values | Critical — the product exists to protect these |
| A2 | Secret key names | Sensitive — reveal infrastructure (Decision D1: encrypted) |
| A3 | Secret files (contents + filenames) | Critical / sensitive |
| A4 | User private keys | Critical — unlock everything a user can access |
| A5 | Password-derived keys / passwords | Critical — derive A4 |
| A6 | Vault keys | Critical — decrypt all vault content |
| A7 | Vault & environment names | Sensitive (ADR-004: encrypted) |
| A8 | Membership graph (who accesses which vault) | Moderate — plaintext by design, access-controlled |
| A9 | Revision/audit metadata (actors, timestamps, counts) | Moderate — plaintext by design, access-controlled |
| A10 | Authentication tokens/sessions | High — grant API access, but never decryption ability |

## 2. Trust boundaries

```
TRUSTED for plaintext:        browser tab running Env Vault ─ CLI process ─ user's device
──────────────────────────────────────────────────────────────────────────────
UNTRUSTED for plaintext:      Next.js backend ─ database ─ object storage ─ network
                              (trusted only for availability & authorization enforcement)
```

- Plaintext of A1–A7 and unencrypted key material must never cross the boundary downward.
- The server IS trusted to: authenticate users, enforce vault membership on ciphertext access, maintain append-only history, and store honest public keys (see limitation L2).

## 3. Adversaries & required outcomes (handoff §36)

| # | Adversary / scenario | Required outcome | Primary defenses |
|---|---|---|---|
| T1 | **Database compromise** — attacker obtains full DB dump | Cannot decrypt secrets (A1–A7) | All secret material AEAD-encrypted under vault keys; vault keys wrapped to user public keys; private keys encrypted under Argon2id-derived KEK; no passwords stored ([crypto-spec.md](crypto-spec.md)) |
| T2 | **Object-storage compromise** | Cannot decrypt files | Files encrypted client-side before upload; filenames encrypted; storage receives ciphertext only |
| T3 | **Backend read access** (compromised server process, insider) | No plaintext available to read | Same as T1; server code has no decryption paths at all; auth keys ≠ encryption keys |
| T4 | **Unauthorized user** requests vault data | Denied at API layer | Central membership guard on every vault-scoped endpoint; IDOR tests (Phase D/H) |
| T5 | **Removed member** accesses future state | No access post-rotation | Cryptographic revocation: vault-key rotation + re-wrap, atomic ([revocation-protocol.md](revocation-protocol.md)) |
| T6 | **Network attacker** | No plaintext or credential capture | TLS mandatory everywhere (even though payloads are ciphertext); HSTS; secure cookies |
| T7 | **Logging/analytics leakage** | No secret values in logs/analytics | No request-body logging on secret endpoints; logger-level redaction; no analytics on key-material pages; audit events carry metadata only |
| T8 | **XSS** — highest-priority risk (crypto runs in the browser) | Minimized probability & blast radius | Strict CSP (no unsafe-inline/eval), zero third-party scripts on key-material pages, dependency review, injection-sink sweeps, React escaping, stored-XSS tests on user-controlled fields (Phase E6/H7) |
| T9 | **Malicious/compromised server serving wrong public keys** (MITM on sharing) | Detectable, documented | See limitation L2 — key fingerprint verification offered; not fully solved in V1 |
| T10 | **User enumeration via login/salt endpoints** | Limited signal | Deterministic dummy salt/params for unknown emails; uniform timing/responses where practical |

## 4. Explicit non-goals (handoff §4, §37 — never claim otherwise)

Env Vault does **not** defend against:

- N1. Authorized users copying/sharing exported secrets (an authorized member with the keys can always obtain plaintext — this is the documented security boundary, handoff §4).
- N2. Malware or a compromised browser/OS on an authorized user's device.
- N3. Former members retaining secrets or historical revisions they decrypted before revocation (rotation protects **future** state only).
- N4. Users voluntarily sharing downloaded `.env` files.
- N5. Screenshots/recordings of non-secret metadata.
- N6. A malicious authorized user modifying secrets they legitimately may modify.

## 5. Known limitations (documented honestly)

| # | Limitation | Posture |
|---|---|---|
| L1 | Password loss = permanent loss of encrypted data (no server-side escrow permitted, handoff §34.12) | Honest UX warning at signup; recovery-code scheme possible post-V1 (user-held, never server-recoverable) |
| L2 | The server distributes public keys; a malicious server could substitute its own key during invitation (T9) | V1: display key fingerprints in UI for optional out-of-band verification; document residual risk. Signed key directories / key transparency are post-V1 |
| L3 | Metadata visible to server: membership graph, revision counts/timing, vault sizes, audit actors (A8–A9) | Accepted for V1; documented |
| L4 | Web-delivered JS means a malicious server could ship malicious client code | Inherent to web apps; mitigated by CSP discipline and (post-V1) the CLI as an independent client; never claim otherwise |

## 6. Decision on metadata sensitivity (resolves O6)

Vault names, environment names, and secret filenames are **user content** and frequently reveal infrastructure ("acme-prod-payments") → **encrypted under the vault key** (see [ADR-004](decisions/adr-004-metadata-sensitivity.md)). Plaintext by design: ids, timestamps, revision numbers, actor ids, roles, invitation states, audit event types.

## 7. Review checklist hooks

Every T# row above must map to at least one automated test or explicit written argument by Phase H (see [plannings/08-phase-h-security-review.md](../plannings/08-phase-h-security-review.md) H1).
