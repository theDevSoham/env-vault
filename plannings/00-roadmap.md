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

- [ ] User authentication
- [ ] User cryptographic identity (X25519 keypair, encrypted private key)
- [ ] Vault creation / deletion
- [ ] Vault-level membership (Owner / Member)
- [ ] Invitations (pending / accepted / revoked / expired)
- [ ] Member removal with cryptographic revocation (key rotation)
- [ ] Environment creation / deletion (Development, Staging, Production + custom)
- [ ] Secret key/value management (names AND values encrypted)
- [ ] Encrypted secret files
- [ ] `.env` export (client-generated)
- [ ] JSON export (client-generated)
- [ ] Immutable revision history (full encrypted snapshots)
- [ ] Structural revision diffs (no values shown, client-computed)
- [ ] Revision restoration (as new revision)
- [ ] Audit logging (no secret material ever)

## MVP success criteria (handoff §38 — final acceptance)

- [ ] 1. A user can create an account
- [ ] 2. A user can create an encrypted vault
- [ ] 3. A user can create Development, Staging and Production environments
- [ ] 4. A user can import `.env` data
- [ ] 5. Secret names and values are encrypted before storage
- [ ] 6. The server cannot decrypt stored secrets
- [ ] 7. A user can invite another user
- [ ] 8. The invited user can cryptographically access the vault
- [ ] 9. A user can remove another member and rotate future access
- [ ] 10. Users can modify environment variables
- [ ] 11. Every committed modification creates an immutable revision
- [ ] 12. Revision history identifies added/removed/renamed/modified keys without values
- [ ] 13. Users can restore an old revision without deleting history
- [ ] 14. Users can export an environment as `.env`
- [ ] 15. Users can export an environment as JSON
- [ ] 16. Export generation occurs locally
- [ ] 17. The web UI never provides a plaintext secret reveal interface
- [ ] 18. Audit logs contain no plaintext secret material
- [ ] 19. A complete database dump is insufficient to decrypt vault secrets

## Explicitly out of scope for V1 (handoff §32 — do not build)

Enterprise SSO / SAML / SCIM, complex RBAC, secret-level ACLs, external secret rotation, Kubernetes operators, CI/CD integrations, self-hosting, secret reveal UI, AI access to secret values, server-side plaintext processing.
