# 08 — Phase H: Security Review

**Goal:** systematic review before any release or CLI work (handoff §35 Phase H). Findings become fix tasks; the phase is done when findings are fixed or explicitly accepted with rationale.

**Dependencies:** Phases D–G complete. **Blocks:** Phase 1.5 (CLI).

## Steps

### H1. Threat-model review
- [ ] Re-walk `docs/threat-model.md` against the implemented system; update where implementation diverged.
- [ ] Verify each handoff §36 scenario has a concrete defense and a test or documented argument.

### H2. Crypto-flow review
- [ ] Line-by-line review of `src/lib/crypto/` against `docs/crypto-spec.md`.
- [ ] Verify nonce handling, key-generation tracking, envelope versioning, atomic rotation.
- [ ] Verify no crypto primitive usage exists outside the crypto module (grep sweep).

### H3. Authorization testing
- [ ] Adversarial test pass: every endpoint × (anonymous, non-member, member, owner, removed member post-rotation).
- [ ] IDOR sweep: object ids from other vaults must always 403/404.

### H4. Logging review
- [ ] Inspect all server logs produced during a full user journey: no secrets, keys, tokens, payload bodies.
- [ ] Audit events reviewed against handoff §27 forbidden list.

### H5. Browser-storage review
- [ ] Full journey with devtools: localStorage, sessionStorage, IndexedDB, cookies, Cache API — no key material or plaintext.
- [ ] Confirm in-memory key store is not accidentally serialized (Redux devtools, error reporters, etc.).

### H6. Dependency review
- [ ] `npm audit` + manual review of client-shipped dependencies; pin crypto library version.
- [ ] Supply-chain posture documented (lockfile discipline, update policy).

### H7. XSS review (highest priority — handoff §36)
- [ ] CSP verified strict on every page touching key material.
- [ ] Injection-sink sweep (`dangerouslySetInnerHTML`, URL-derived rendering, markdown rendering).
- [ ] Attempted stored-XSS via user-controlled fields (vault names, messages, filenames).

### H8. Claims review
- [ ] All user-facing copy and docs reviewed against handoff §4/§37: no over-claiming (e.g., never claim authorized users can't extract plaintext).

## Exit criteria

- [ ] Findings log written to `docs/` (e.g. `security-review-v1.md`), all items fixed or accepted with rationale.
- [ ] MVP criteria #17, #18, #19 verified.
- [ ] Worklog entry written. CLI work may now begin.
