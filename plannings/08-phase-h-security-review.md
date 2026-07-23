# 08 — Phase H: Security Review

**Status: DONE (2026-07-23)** — findings log: [docs/security-review-v1.md](../docs/security-review-v1.md) · worklog: [worklog/phase-h-security-review__worklog_2026-07-23.md](../worklog/phase-h-security-review__worklog_2026-07-23.md)

**Goal:** systematic review before any release or CLI work (handoff §35 Phase H). Findings become fix tasks; the phase is done when findings are fixed or explicitly accepted with rationale.

**Dependencies:** Phases D–G complete. **Blocks:** Phase 1.5 (CLI).

## Steps

### H1. Threat-model review
- [x] Re-walked `docs/threat-model.md` T1–T10 against the implementation — no divergence; status → Reviewed.
- [x] Every scenario mapped to a concrete defense + test/argument (table in the findings log).

### H2. Crypto-flow review
- [x] `src/lib/crypto/` reviewed against `docs/crypto-spec.md`; nonce handling, generation tracking, envelope versioning, atomic rotation all conform.
- [x] Primitive-confinement grep + automated isolation test: no primitives outside the module. Finding SR-5 fixed (libsodium pinned exact per ADR-001).

### H3. Authorization testing
- [x] Adversarial matrix covered by automated tests (anonymous/non-member/member/owner/removed-member incl. post-rotation lockout and invitation theft).
- [x] IDOR sweep: guard-count audit across all 25 routes — only the four public auth endpoints are guard-free (rate-limited); nested resources re-check vault scope.

### H4. Logging review
- [x] Single production log statement (method/path/status on 5xx); no body logging anywhere.
- [x] All 13 audit call sites reviewed: metadata only. SR-4 fixed: `no-store` + `nosniff` on all API responses (verified live).

### H5. Browser-storage review
- [x] Live journey audit re-confirmed: no localStorage/IndexedDB/plaintext-DOM; HttpOnly cookie; keystore outside React state, zeroized on lock.
- [x] SR-1 fixed: `server-only` import guard on the DB layer (vitest stubs it).

### H6. Dependency review
- [x] `npm audit` triaged: sharp CVEs mitigated by SR-7 (`images.unoptimized` — next/image unused); postcss advisory accepted (build-time, not our usage); drizzle-kit deprecations accepted (dev-only). Monitor Next releases.
- [x] Supply-chain posture: lockfile committed; crypto lib pinned; client third-party surface = libsodium + framework only.

### H7. XSS review
- [x] CSP verified strict on live responses; injection-sink sweep zero hits; user-controlled strings render as React text nodes only.
- [x] Stored-XSS probes render inertly; `style-src 'unsafe-inline'` exception re-affirmed with rationale (script-src remains strict).

### H8. Claims review
- [x] README replaced (SR-6) with honest guarantee + explicit non-claims; signup/export/rotation copy reviewed against handoff §4/§37 — no over-claiming.

## Exit criteria

- [x] Findings log written (`docs/security-review-v1.md`): SR-1…SR-7 fixed, 4 acceptances with rationale — nothing dropped silently.
- [x] MVP #17 re-audited, #18 and #19 formally signed off → **all 19 MVP criteria pass; V1 complete.**
- [x] Worklog entry written. CLI work (Phase 1.5) may now begin — gated on finalizing `docs/cli-key-provisioning.md`.
