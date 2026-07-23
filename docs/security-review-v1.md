# Env Vault — V1 Security Review (Phase H)

**Status:** Complete · **Date:** 2026-07-23 · **Scope:** everything built in Phases B–G
**Method:** per [plannings/08-phase-h-security-review.md](../plannings/08-phase-h-security-review.md) H1–H8. Findings are labeled SR-n; every finding is either **fixed** (this phase) or **accepted** with rationale. Nothing was silently dropped.

---

## H1 — Threat-model review

Re-walked [threat-model.md](threat-model.md) T1–T10 against the implementation. No divergence found; the model's mitigations map to shipped mechanisms:

| Threat | Defense as built | Evidence |
|---|---|---|
| T1 DB compromise | All secret material is AEAD ciphertext in jsonb envelopes; keys wrapped per member; verifier is Argon2id re-hash | Schema self-check test (every envelope column jsonb); no-plaintext scan tests |
| T2 storage compromise | Collapses into T1 for V1 (ADR-007); chunks are secretstream ciphertext | Blob-store round-trip tests |
| T3 backend read access | Zero decryption paths server-side; authKey ≠ KEK by KDF domain separation | Crypto isolation test; code review |
| T4 unauthorized user | Central guard, 404 for non-members, IDOR scoping on nested resources | Authorization-matrix tests; guard sweep (below) |
| T5 removed member | Atomic rotation; envelope-set validation; no gen-(g+1) envelope for removed | Rotation tests (crypto, DB, API levels); post-rotation 404 verified |
| T6 network attacker | TLS assumed at deployment (Neon enforced: `verify-full`); HttpOnly/SameSite cookies; Secure flag in production | Config review |
| T7 log leakage | One log statement in prod code (method/path/status); audit contexts = ids/counts/format only | Grep sweep + audit call-site review (all 13 sites) |
| T8 XSS | Nonce+strict-dynamic CSP, no third-party scripts, zero injection sinks, React escaping | Sink sweep (0 hits); headers verified live |
| T9 key substitution | Fingerprints rendered for members/invitees | UI review; residual risk documented (L2) |
| T10 enumeration | Dummy KDF params (deterministic, secret-keyed); uniform 401s; **timing equalized this phase (SR-2)** | curl timing measurement |

## H2 — Crypto-flow review

- `src/lib/crypto/` re-read against [crypto-spec.md](crypto-spec.md): envelope formats, key hierarchy, AAD bindings, generation tracking all match. Nonces CSPRNG-only and module-internal; callers cannot supply them.
- Primitive confinement verified by grep + the automated isolation test: no libsodium/`crypto.subtle` outside the module. (`crypto.randomUUID` for public ids and `getRandomValues` for the dev-only dummy-KDF secret are not secret-key primitives.)
- Rotation atomicity: single DB transaction validated server-side (base generation, exact envelope set, full environment coverage); interruption tested to roll back cleanly.
- **SR-5 (fixed):** `libsodium-wrappers-sumo` was installed with a `^` range while ADR-001 requires pinning → pinned exact `0.8.4`.

## H3 — Authorization testing

- Automated matrix (Phase D/F tests): anonymous → 401 everywhere; non-member → 404 (existence hidden) incl. delete attempts; member vs owner 403 splits; cross-account invitation acceptance → 404; post-rotation member fully locked out.
- Guard sweep across all 25 routes: the only guard-free routes are the four deliberately public auth endpoints (kdf/login/logout/signup), all rate-limited. Every nested resource re-checks vault scope (env-in-vault, file-in-vault) — IDOR attempts return 404.

## H4 — Logging review

- Production log surface: exactly one statement (`withRoute`, method + path + status on 5xx). No body, header, or payload logging anywhere; error responses are generic codes.
- All 13 `appendAudit` call sites reviewed: contexts contain ids, counts, sizes, formats, generations — no emails in contexts, no envelope material, no free text from requests. API test asserts no ciphertext blobs appear in audit output.
- **SR-4 (fixed):** API responses lacked cache/content-type hardening → all JSON and chunk responses now send `Cache-Control: no-store` + `X-Content-Type-Options: nosniff` (verified live).

## H5 — Browser-storage review

- Live audit (Phase E, re-confirmed G): localStorage empty, no IndexedDB, `document.cookie` empty (HttpOnly), no plaintext secrets in DOM after commit/export.
- Key material lives in module-scope variables outside React state (cannot be serialized by devtools/reporters); `lock()` zeroizes buffers; reload provably wipes keys (UnlockGate journey).
- **SR-1 (fixed):** DB/server modules had no import-boundary guard → `import "server-only"` added to `src/lib/db/client.ts` (covers everything importing the DB); vitest aliases the package to a stub since tests legitimately run handlers in Node.

## H6 — Dependency review

`npm audit`: 7 advisories, all transitive. Disposition:

| Advisory | Path | Disposition |
|---|---|---|
| sharp < 0.35 (libvips CVEs, high) | next/image optimizer | **SR-7 (mitigated):** `images.unoptimized: true` — sharp removed from every runtime path (next/image is unused). Monitor Next releases |
| postcss < 8.5.10 stringify XSS (moderate) | bundled in next | Accepted: build-time only; we never stringify untrusted CSS. Monitor Next releases |
| @esbuild-kit/* (deprecated, moderate) | drizzle-kit | Accepted: dev-only migration tooling, never in production runtime |

Client-shipped third-party code remains exactly two crypto-relevant packages: `libsodium-wrappers-sumo` (now pinned) + framework (Next/React). No analytics, no CDN scripts, no fonts fetched at runtime.

## H7 — XSS review

- CSP live-verified: `script-src 'self' 'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'` (+`unsafe-eval` dev only), `connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`.
- Injection-sink sweep: zero `dangerouslySetInnerHTML` / `innerHTML` / `document.write` in app + src. All user-controlled strings (vault/env/file names, revision messages, emails) render as React text nodes (auto-escaped); no URL-derived rendering; `Link` hrefs are template-built from server-issued UUIDs.
- **Accepted exception (from Phase E, re-affirmed):** `style-src 'unsafe-inline'` — Next/Tailwind inject un-nonced style tags; style injection without script execution is a materially lower risk and script-src remains strict. Re-evaluate when Next supports nonced style emission.
- Stored-XSS probe: names/messages containing `<script>`/`"><img onerror…` render inertly as text (React escaping; spot-checked in dev during Phase E journeys — additionally these strings are ciphertext server-side, so they can only ever re-enter via our own decrypt-then-render path).

## H8 — Claims review

- README replaced (was create-next-app boilerplate) with copy that states the real guarantee and the explicit non-claims (authorized-member extraction, no password recovery, rotation = future-only) — handoff §4/§37.
- Signup warning + acknowledgement checkbox (L1), export plaintext-copy notice, rotation confirm dialog wording, and pending-invite "encrypted until you join" copy all reviewed — no over-claiming found.

## Additional findings

- **SR-2 (fixed):** login burned Argon2id verification only for existing accounts — unknown emails returned ~instantly, a timing oracle for account existence (T10). Now unknown emails verify against a dummy verifier; measured ~0.51s vs ~0.53s post-fix.
- **SR-3 (fixed):** missing `SERVER_SECRET` silently fell back to an ephemeral random secret; in production that rotates dummy KDF salts every restart (an enumeration signal). Now a hard startup error in production.
- **SR-6 (fixed):** README boilerplate (see H8).
- **Accepted:** signup's `email_taken` response reveals account existence (inherent to signup; rate-limited; email-verification flow is the post-V1 remedy). In-memory rate limiter (single-instance V1; shared store needed at multi-instance deploy — documented since Phase D). Expired-session rows garbage-collect lazily. Expired invitations display until acceptance fails (cosmetic).

## MVP sign-off (roadmap #18/#19)

- **#18 — audit logs contain no plaintext secret material: PASS.** By construction (contexts are typed metadata; names/values exist only inside envelopes) + call-site review + automated assertion.
- **#19 — a complete database dump is insufficient to decrypt vault secrets: PASS.** The dump contains: AEAD ciphertext (needs vault keys), vault keys only as X25519 sealed boxes (need member private keys), private keys only AES-GCM-encrypted under Argon2id-derived KEKs (need passwords, which are never stored — the auth verifier is a domain-separated derivative re-hashed server-side and yields no KEK material). Session-token hashes cannot decrypt anything (handoff §23). Chain verified end-to-end by the real-crypto test suites.

**All 19 MVP criteria now pass. V1 is complete pending user acceptance. CLI work (Phase 1.5) is unblocked per handoff §35 — gated on finalizing [cli-key-provisioning.md](cli-key-provisioning.md).**
