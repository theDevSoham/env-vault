# 00 — Roadmap & MVP Success Criteria

**Goal:** track the overall path from empty scaffold to the MVP defined in [PROJECT_HANDOFF.md](../PROJECT_HANDOFF.md) §38.

## Phase sequence

```
A. Architecture ─▶ B. Crypto prototype ─▶ C. Data model ─▶ D. Backend
                                                              │
        H. Security review ◀─ G. Export ◀─ F. Version control ◀─ E. Web client
                │
                ▶ Phase 1.5: CLI (only after H)
```

Do **not** start by building UI (handoff §35). Crypto correctness is proven in isolation (Phase B) before any persistence or UI exists.

## V1 feature checklist (handoff §31)

- [x] User authentication
- [x] User cryptographic identity (X25519 keypair, encrypted private key)
- [x] Vault creation / deletion
- [x] Vault-level membership (Owner / Member)
- [x] Invitations (pending / accepted / revoked / expired)
- [x] Member removal with cryptographic revocation (key rotation)
- [x] Environment creation / deletion (Development, Staging, Production + custom)
- [x] Secret key/value management (names AND values encrypted)
- [x] Encrypted secret files
- [x] `.env` export (client-generated)
- [x] JSON export (client-generated)
- [x] Immutable revision history (full encrypted snapshots)
- [x] Structural revision diffs (no values shown, client-computed)
- [x] Revision restoration (as new revision)
- [x] Audit logging (no secret material ever)

## MVP success criteria (handoff §38 — final acceptance)

- [x] 1. A user can create an account *(browser-verified, Phase E)*
- [x] 2. A user can create an encrypted vault *(browser-verified, Phase E)*
- [x] 3. A user can create Development, Staging and Production environments *(custom names supported; browser-verified)*
- [x] 4. A user can import `.env` data *(editor import; parser unit-tested)*
- [x] 5. Secret names and values are encrypted before storage *(Model B snapshots; schema self-check test)*
- [x] 6. The server cannot decrypt stored secrets *(no decryption path server-side; DB stores envelopes only)*
- [x] 7. A user can invite another user *(both flows; API-tested)*
- [x] 8. The invited user can cryptographically access the vault *(real-crypto sharing test, Phase B/F)*
- [x] 9. A user can remove another member and rotate future access *(atomic rotation; API + crypto tests)*
- [x] 10. Users can modify environment variables *(browser-verified)*
- [x] 11. Every committed modification creates an immutable revision *(append-only triggers + tests, Phase F)*
- [x] 12. Revision history identifies added/removed/renamed/modified keys without values *(browser-verified, Phase F)*
- [x] 13. Users can restore an old revision without deleting history *(browser-verified, Phase F)*
- [x] 14. Users can export an environment as `.env` *(browser-verified, Phase G)*
- [x] 15. Users can export an environment as JSON *(browser-verified, Phase G)*
- [x] 16. Export generation occurs locally *(network trace: zero plaintext left the browser, Phase G)*
- [x] 17. The web UI never provides a plaintext secret reveal interface *(by design; re-audited in Phase H)*
- [x] 18. Audit logs contain no plaintext secret material *(Phase H sign-off: call-site review + automated assertion — security-review-v1.md)*
- [x] 19. A complete database dump is insufficient to decrypt vault secrets *(Phase H sign-off: full decryption-chain argument — security-review-v1.md)*

**All 19 MVP criteria pass — V1 complete (2026-07-23).**

## Explicitly out of scope for V1 (handoff §32 — do not build)

Enterprise SSO / SAML / SCIM, complex RBAC, secret-level ACLs, external secret rotation, Kubernetes operators, CI/CD integrations, self-hosting, secret reveal UI, AI access to secret values, server-side plaintext processing.
