# 04 — Phase D: Backend APIs

**Goal:** authorization + encrypted-storage APIs (handoff §35 Phase D). The backend coordinates and stores; it never decrypts, never generates exports, never logs secret-carrying payloads.

**Dependencies:** Phase C. **Blocks:** E.

> ⚠ Next.js 16: read `node_modules/next/dist/docs/` (route handlers, middleware/proxy, caching semantics) before writing any route code.

## Steps

### D1. Authentication (per O2 ADR)
- [ ] Signup: store email, auth verifier, public key, encrypted private key, KDF salt + params — nothing else.
- [ ] Login: issue session/tokens; tokens must be useless for decryption (handoff §23).
- [ ] Session middleware for route handlers; consistent 401/403 semantics.

### D2. Authorization layer
- [ ] Central vault-access guard: every vault-scoped endpoint checks membership + role before touching data.
- [ ] Owner-only operations: manage vault, environments, invitations, member removal, key rotation commit.
- [ ] Authorization test suite: unauthorized user, non-member, member-vs-owner (maps to handoff §36 "Unauthorized User").

### D3. Core endpoints (all payloads are ciphertext envelopes)
- [ ] Vaults: create (accepts encrypted vault-key envelope), list, get, delete.
- [ ] Environments: create, list, delete.
- [ ] Revisions: commit (base-revision number required; returns 409-style conflict on mismatch — handoff §30), list, get payload.
- [ ] Secret files: upload/replace/download of encrypted blobs via object storage (server streams or pre-signs; blobs stay encrypted), delete.
- [ ] Invitations: create, list, accept, revoke; expiry handling; deferred envelope-wrap flow per O7 ADR.
- [ ] Members: list, remove (marks membership; rotation happens in D4).
- [ ] Key rotation: atomic commit endpoint — new envelopes for remaining members + re-encrypted current state in one transaction (handoff §34.11); no envelope for removed member.
- [ ] Public keys: lookup endpoint for envelope wrapping by inviter clients.

### D4. Audit logging
- [ ] Append audit events for every action in handoff §27 list.
- [ ] Audit read endpoint (vault members only).
- [ ] Enforce: no secret values, keys, passwords, or tokens in events.

### D5. Logging & error hygiene (handoff §27, §34)
- [ ] Never log request bodies on secret-carrying endpoints; redaction at the logger level, not per-call discipline.
- [ ] Error responses contain no payload echoes.
- [ ] Rate limiting on auth endpoints.

## Exit criteria

- [ ] Integration tests: every endpoint rejects unauthorized/wrong-role access.
- [ ] Concurrency test: two conflicting revision commits → exactly one wins, other gets conflict.
- [ ] Rotation test: interrupted rotation leaves consistent state (transaction rollback).
- [ ] Grep/review pass confirms no plaintext secret material in any log statement.
- [ ] Worklog entry written.
