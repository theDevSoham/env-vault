# ENV VAULT — PRODUCT, SECURITY & ENGINEERING HANDOFF

**Document Status:** Initial Architecture / Pre-Implementation
**Target Audience:** Coding agents, software engineers, security reviewers
**Project:** Env Vault
**Primary Goal:** Build a zero-knowledge, developer-focused encrypted storage and sharing platform for `.env` secrets and secret files.

---

# 1. PRODUCT VISION

Env Vault is a zero-knowledge secrets storage and sharing platform designed primarily for individual developers and small development teams.

It provides secure cloud storage for environment variables and sensitive configuration files while ensuring that the Env Vault backend and database cannot decrypt user secrets.

The primary use case is replacing insecure workflows such as:

* Sending `.env` files through chat applications.
* Sending secrets through email.
* Uploading `.env` files to generic cloud storage.
* Copying secrets manually between developers.
* Accidentally committing secrets to Git.
* Maintaining multiple untracked versions of `.env` files.
* Losing track of who has access to which environment.
* Having no reliable history of changes to environment variables.

Env Vault should provide developers with a secure equivalent of cloud storage plus version control specifically designed for secrets.

The core product principle is:

> Secrets are encrypted before reaching Env Vault infrastructure. The server stores and synchronizes encrypted information but must not possess the cryptographic material required to decrypt user secrets.

---

# 2. TARGET USERS

Initial target audience:

* Individual developers.
* Freelancers.
* Small development teams.
* Startup engineering teams.
* Agencies managing client projects.
* Small open-source teams.

Initial expected team size:

1–20 users.

Enterprise functionality is explicitly outside the initial product scope.

---

# 3. CORE SECURITY PRINCIPLE

Env Vault must use a zero-knowledge architecture.

The backend must never intentionally receive or store:

* Plaintext secret values.
* Plaintext secret files.
* User master encryption keys.
* Unencrypted user private encryption keys.
* User passwords.

The backend may store:

* Encrypted secret payloads.
* Encrypted files.
* Encrypted vault keys.
* Public keys.
* Password KDF salts and parameters.
* Authentication verifiers or authentication-provider identifiers.
* Non-sensitive metadata.
* Membership information.
* Revision metadata.
* Audit events.

All secret encryption and decryption must occur in a trusted client context.

For the web application, cryptographic operations occur client-side.

For the CLI, cryptographic operations occur locally.

The server acts as:

* Authentication coordinator.
* Authorization layer.
* Encrypted data storage.
* Synchronization layer.
* Membership manager.
* Audit-event store.

The server must not act as a decryption service.

---

# 4. IMPORTANT SECURITY BOUNDARY

Env Vault does NOT promise that an authorized vault member can never obtain plaintext.

An authorized user who possesses the required cryptographic keys can ultimately decrypt information on their own device.

The actual security guarantee is:

> Env Vault infrastructure cannot decrypt secrets, and the Env Vault web UI does not provide a general-purpose plaintext secret reveal interface.

This distinction must be preserved in product documentation and implementation.

Do not claim that authorized users are technically incapable of extracting plaintext.

---

# 5. CORE DOMAIN MODEL

The initial hierarchy is:

User
└── Vault Memberships

Vault
├── Members
├── Environments
├── Secret Files
├── Revisions
└── Audit Events

Environment
├── Secret Keys
└── Revision History

Example:

Acme Project
├── Development
│   ├── DATABASE_URL
│   ├── JWT_SECRET
│   └── API_KEY
├── Staging
│   ├── DATABASE_URL
│   ├── JWT_SECRET
│   └── API_KEY
└── Production
├── DATABASE_URL
├── JWT_SECRET
└── API_KEY

A Vault represents a project or logical collection of secrets.

An Environment represents a deployment context within the vault.

Initial standard environment names may include:

* Development
* Staging
* Production

Users must also be able to create custom environments.

---

# 6. VAULT MEMBERSHIP

V1 uses vault-level access control.

If a user is granted access to a vault, they may access the environments contained within that vault according to their vault-level permission.

Secret-level ACLs are explicitly excluded from V1.

Avoid implementing per-secret access policies unless requirements are formally changed.

Initial roles should remain minimal.

Recommended:

* Owner
* Member

Owner can:

* Manage vault.
* Invite members.
* Remove members.
* Manage environments.
* Modify secrets.
* Export secrets.
* Manage secret files.

Member can:

* Access authorized vault.
* Modify secrets.
* Export secrets.
* Access secret files.

More granular RBAC is outside V1.

---

# 7. SECRET VISIBILITY POLICY

The web application must NOT provide a standard "Reveal Secret" feature.

Do not create interfaces such as:

[Reveal API Key]

or plaintext tables displaying secret values.

The primary web UI should display keys structurally:

DATABASE_URL
JWT_SECRET
STRIPE_SECRET_KEY

Values remain concealed.

Users interact with secrets through controlled operations.

Supported initial retrieval mechanisms:

1. Download as `.env`.
2. Download as JSON.

Future retrieval mechanisms:

3. CLI pull.
4. CLI process injection.
5. CI/CD integration.

The web client may decrypt secrets in memory temporarily when generating an authorized export.

The decrypted result should not be transmitted back to the Env Vault server.

---

# 8. EXPORT FORMATS

V1 must support at least two export formats.

## 8.1 .env

Example output:

DATABASE_URL=postgres://...
JWT_SECRET=...
API_KEY=...

The client decrypts values locally and constructs the file locally.

The backend must not generate the plaintext `.env` file.

## 8.2 JSON

Example output:

{
"DATABASE_URL": "postgres://...",
"JWT_SECRET": "...",
"API_KEY": "..."
}

Again, generation occurs locally after client-side decryption.

Future formats may include:

* YAML.
* Docker-compatible env formats.
* Kubernetes Secret manifests.
* Platform-specific configuration formats.

These are not V1 requirements.

---

# 9. VERSION CONTROL MODEL

Env Vault requires environment-level version control.

Version control must track changes to BOTH:

1. Secret values.
2. Secret key structure.

The revision system must therefore capture changes such as:

* Key added.
* Key deleted.
* Key renamed.
* Secret value changed.
* Multiple keys changed together.
* Environment restored to previous revision.

Example:

Revision 41

* STRIPE_WEBHOOK_SECRET
  ~ DATABASE_URL

- LEGACY_API_KEY

The user should be able to understand WHAT changed without exposing secret values.

Example UI:

Revision 41
Changed by Alice
July 21, 2026

Added:

* STRIPE_WEBHOOK_SECRET

Modified:
~ DATABASE_URL

Deleted:

* LEGACY_API_KEY

The audit and revision UI must never show:

DATABASE_URL:
old-password → new-password

Instead it should show:

DATABASE_URL
Value changed

---

# 10. REVISION STRATEGY

Environment revisions should be immutable.

Every committed mutation creates a new revision.

Example:

Revision 1
Initial environment

Revision 2
Added DATABASE_URL

Revision 3
Added JWT_SECRET

Revision 4
Changed DATABASE_URL

Revision 5
Renamed JWT_SECRET → AUTH_SECRET

Revision 6
Deleted LEGACY_API_KEY

A revision should contain enough encrypted state or encrypted change information to reconstruct or restore the environment.

Implementation options include:

A. Full encrypted snapshots.

B. Encrypted deltas.

For V1, full encrypted snapshots are recommended unless storage requirements make them unreasonable.

Reasons:

* Simpler restoration.
* Simpler cryptographic reasoning.
* Lower risk of broken revision chains.
* Easier implementation.
* Easier synchronization.

Optimization to delta-based storage can occur later.

---

# 11. ATOMIC CHANGESETS

Changes should be grouped into revisions.

Example:

A developer performs:

* Adds API_URL.
* Changes DATABASE_URL.
* Deletes OLD_TOKEN.

The resulting operation should ideally produce one revision:

Revision 52

* API_URL
  ~ DATABASE_URL

- OLD_TOKEN

This gives Env Vault Git-like change semantics without attempting to replicate Git itself.

A revision should have:

* Revision ID.
* Vault ID.
* Environment ID.
* Revision number.
* Actor.
* Timestamp.
* Encrypted snapshot or encrypted delta.
* Non-secret structural change metadata where safe.
* Optional user-provided change message.

Example optional message:

"Update production database configuration"

Never place secret values in revision messages.

---

# 12. SECRET KEY NAMES AND ZERO-KNOWLEDGE TRADEOFF

The implementation team must explicitly decide whether secret KEY NAMES are considered sensitive.

Example:

STRIPE_SECRET_KEY
DATABASE_URL
INTERNAL_ADMIN_TOKEN

Even without values, these names can reveal infrastructure information.

Two possible models exist.

## Model A — Encrypt Values Only

Server can see key names.

Advantages:

* Easier search.
* Easier diff generation.
* Easier version metadata.
* Simpler UI and API.

Disadvantages:

* Metadata leakage.

## Model B — Encrypt Key Names and Values

Server cannot see either.

Advantages:

* Stronger zero-knowledge guarantees.

Disadvantages:

* Client must calculate diffs.
* Search must occur client-side.
* Revision structural metadata becomes more complex.

Recommended architecture:

**Encrypt both secret names and secret values wherever practical.**

Non-sensitive identifiers and revision numbers may remain plaintext.

Structural diffs should be calculated by the trusted client.

The server may store encrypted diff metadata.

The coding agent must not silently downgrade this requirement for implementation convenience.

---

# 13. USER CRYPTOGRAPHIC IDENTITY

Each user requires an asymmetric cryptographic identity.

Recommended initial approach:

* X25519 key agreement/encryption-compatible construction.
* Separate signing keys may be introduced if cryptographic signing of revisions becomes necessary.

Each user has:

* Public key.
* Private key.

The public key may be stored on the server.

The private key must be encrypted before storage.

Conceptual flow:

Password
↓
Argon2id
↓
Password-Derived Key
↓
Decrypt Encrypted Private Key
↓
User Private Key

The server must never receive the decrypted private key.

---

# 14. PASSWORD KEY DERIVATION

Recommended password KDF:

Argon2id.

The implementation must:

* Generate a unique random salt.
* Store the salt.
* Store KDF parameters.
* Use strong memory-hard parameters appropriate for target clients.
* Allow KDF parameters to evolve over time.

Do not hardcode parameters without documenting the rationale.

Do not use:

* Raw SHA-256(password).
* MD5.
* SHA-1.
* Custom password hashing.

---

# 15. SYMMETRIC ENCRYPTION

Recommended authenticated encryption:

AES-256-GCM.

Every encryption operation must use a correctly generated unique nonce according to the algorithm's requirements.

Nonce reuse with the same key must never occur.

The implementation should centralize cryptographic operations in a carefully reviewed crypto module.

Application code should not manually assemble cryptographic primitives throughout the codebase.

---

# 16. VAULT KEY MODEL

Each vault has a randomly generated Vault Key.

Conceptually:

CSPRNG
↓
Vault Key

The Vault Key encrypts vault/environment secret material.

The Vault Key itself is encrypted separately for every authorized member.

Example:

Vault A

VaultKey

├── Encrypted for Soham
├── Encrypted for Alice
└── Encrypted for Bob

The server stores the encrypted key envelopes.

It never receives the plaintext Vault Key.

---

# 17. VAULT CREATION

When a user creates a vault:

1. Client generates Vault Key using a cryptographically secure random generator.
2. Client encrypts Vault Key for the owner's cryptographic identity.
3. Client sends encrypted Vault Key envelope to backend.
4. Backend stores vault metadata and encrypted envelope.

The backend must never receive plaintext Vault Key material.

---

# 18. SHARING FLOW

Example:

Soham owns Vault A.

Soham invites Alice.

Alice has:

* Public Key.
* Private Key.

The sharing flow conceptually performs:

Vault Key
↓
Encrypt/wrap for Alice
↓
Encrypted Vault Key Envelope

The encrypted envelope is stored for Alice.

Alice can then use her private key locally to obtain the Vault Key.

The server coordinates this exchange but cannot decrypt the Vault Key.

---

# 19. INVITATION FLOW

Recommended flow:

1. Owner enters invitee email.
2. Server checks whether user exists.
3. Invitation is created.
4. When cryptographic identity is available, owner client obtains invitee public key.
5. Owner client creates encrypted Vault Key envelope for invitee.
6. Server stores membership and encrypted key envelope.
7. Invitee accepts invitation.
8. Invitee can decrypt Vault Key locally.

Invitation state should include:

* Pending.
* Accepted.
* Revoked.
* Expired.

The implementation must carefully handle invitations to users who do not yet have accounts.

Do not invent an insecure server-side key escrow mechanism to support pending invitations.

---

# 20. REVOCATION

Removing a user from database membership alone is not sufficient cryptographic revocation.

If a user has previously decrypted a Vault Key, assume they may retain it indefinitely.

Therefore:

Revocation must guarantee that removed users cannot decrypt FUTURE vault state.

Recommended flow:

1. Remove user's membership authorization.
2. Generate a new Vault Key.
3. Re-encrypt current vault/environment state with new Vault Key.
4. Create new encrypted Vault Key envelopes for remaining members.
5. Do not create an envelope for removed member.
6. Commit key rotation atomically.

Historical information previously accessible to the removed user cannot be cryptographically "unlearned."

This limitation must be documented.

---

# 21. KEY ROTATION AND REVISION HISTORY

Key rotation introduces an important version-control question.

If old revisions remain encrypted with an old Vault Key previously known by a revoked user, that user may still decrypt historical data they previously had access to.

This is expected.

For future revisions:

* Use the rotated Vault Key.

The system must distinguish:

* Historical access.
* Future access.

Revocation guarantees future confidentiality, not retroactive erasure of information already accessible to a former member.

---

# 22. FILE STORAGE

Vaults may contain encrypted secret files.

Examples:

* service-account.json
* firebase.json
* private.pem
* certificates
* application configuration files

File contents must be encrypted client-side.

For sufficiently large files, do not naïvely load entire files into browser memory if streaming/chunked authenticated encryption is more appropriate.

File metadata must be evaluated individually for sensitivity.

Potentially sensitive filenames should preferably be encrypted.

Encrypted blobs may be stored in object storage.

The object-storage provider must receive only encrypted data.

---

# 23. AUTHENTICATION VS ENCRYPTION

Authentication and encryption must remain separate concepts.

Authentication answers:

"Is this user allowed to request this encrypted data?"

Encryption answers:

"Can this client decrypt this data?"

Passing authentication must not automatically give the server access to decryption keys.

A backend authorization vulnerability should not automatically expose plaintext secrets.

---

# 24. CLI

CLI support is a first-class architectural requirement, even if delivered after the first web MVP.

Potential commands:

envvault login

envvault vault list

envvault env list

envvault pull

envvault pull --environment development

envvault pull --format env

envvault pull --format json

Future:

envvault run -- npm start

The CLI should eventually support running processes with injected environment variables without permanently writing `.env` files.

Example:

envvault run -- npm run dev

Secrets exist only in the child process environment.

---

# 25. CLI AUTHENTICATION

Avoid requiring passwords directly in CLI command arguments.

Do NOT encourage:

envvault login --password mypassword

Recommended approach:

Browser/device authorization flow.

Example:

envvault login

CLI displays:

ABCD-EFGH

User authenticates and approves device in browser.

CLI receives appropriate authentication credentials.

Cryptographic key provisioning to the CLI requires a separately designed secure flow.

Authentication tokens alone must not magically allow the server to decrypt or provide plaintext secrets.

This area requires explicit security design before implementation.

---

# 26. LOCAL SECRET HANDLING

By default, Env Vault clients should minimize plaintext persistence.

Web:

* Decrypt only when required.
* Keep plaintext lifetime short.
* Avoid localStorage for plaintext secrets.
* Avoid IndexedDB plaintext storage.
* Never send plaintext to analytics.
* Never send plaintext to logging systems.

CLI:

`envvault pull` may explicitly write plaintext to disk.

Example:

.env

The user is choosing to create a local plaintext copy.

The CLI should warn or document this behavior.

Future preferred workflow:

envvault run -- npm start

which avoids permanent plaintext files.

---

# 27. AUDIT LOGGING

Audit events should include:

* Vault created.
* Vault deleted.
* Member invited.
* Invitation accepted.
* Member removed.
* Environment created.
* Environment deleted.
* Revision created.
* Revision restored.
* Export requested.
* Secret file uploaded.
* Secret file replaced.
* Vault key rotated.

Audit logs must never contain:

* Secret values.
* Decrypted files.
* Encryption keys.
* Passwords.
* Authentication tokens.

Care must also be taken with error messages.

Never log raw request payloads from secret-related endpoints.

---

# 28. RESTORING REVISIONS

Users should be able to restore an environment to a previous revision.

Example:

Current:

Revision 52

User selects:

Revision 47

The system should NOT delete revisions 48–52.

Instead:

Revision 53

"Restored state from Revision 47"

This preserves immutable history.

The restoration operation creates a new revision containing the restored state.

---

# 29. REVISION COMPARISON

Users should be able to compare revisions structurally.

Example:

Compare Revision 47 → Revision 52

Added:

* STRIPE_SECRET

Removed:

* OLD_PAYMENT_KEY

Renamed:
~ API_SECRET → INTERNAL_API_SECRET

Modified:
~ DATABASE_URL

Values must never be displayed.

Diff computation should occur client-side if key names are encrypted.

---

# 30. CONCURRENCY

The implementation should protect against two users accidentally overwriting each other's revisions.

Recommended mechanism:

Optimistic concurrency control.

Example:

Client edits Revision 51.

Meanwhile another client creates Revision 52.

First client attempts commit based on Revision 51.

Server rejects with revision conflict.

Client must fetch latest revision and resolve/reapply changes.

Do not silently overwrite newer revisions.

---

# 31. INITIAL PRODUCT FEATURES

V1 should contain:

* User authentication.
* User cryptographic identity.
* Vault creation.
* Vault deletion.
* Vault-level membership.
* Invitations.
* Member removal.
* Environment creation.
* Environment deletion.
* Secret key/value management.
* Encrypted secret storage.
* Encrypted secret files.
* `.env` export.
* JSON export.
* Immutable revision history.
* Structural revision diffs.
* Revision restoration.
* Audit logging.
* Cryptographic revocation/key rotation.

---

# 32. EXPLICITLY OUT OF SCOPE FOR V1

Do not implement unless requirements change:

* Enterprise SSO.
* SAML.
* SCIM.
* Complex RBAC.
* Secret-level ACLs.
* Automatic external secret rotation.
* Kubernetes operators.
* GitHub Actions integration.
* CI/CD integrations.
* Self-hosting.
* Secret reveal UI.
* AI access to secret values.
* Server-side plaintext secret processing.

---

# 33. FUTURE FEATURES

Potential future phases:

## Phase 1.5

* CLI.
* `envvault pull`.
* `envvault run`.
* Device management.

## Phase 2

* GitHub Actions.
* CI/CD integrations.
* Service accounts.
* Machine identities.
* Temporary access.
* Expiring memberships.

## Phase 3

* Advanced RBAC.
* Enterprise organizations.
* SSO.
* Self-hosting.
* Automated secret rotation.

---

# 34. SECURITY IMPLEMENTATION RULES FOR CODING AGENTS

Any coding agent implementing this system must follow these rules.

1. Do not invent custom cryptographic algorithms.

2. Use established, audited cryptographic libraries.

3. Do not silently move encryption or decryption to the backend.

4. Never log plaintext secrets.

5. Never include secrets in URLs.

6. Never store plaintext secrets in browser persistent storage.

7. Never expose plaintext secret values through analytics.

8. Treat exception tracking systems as external systems that must not receive secrets.

9. Never reuse AES-GCM nonces with the same key.

10. Use CSPRNG-generated keys.

11. Treat cryptographic key rotation as an atomic operation.

12. Do not implement password recovery by storing recoverable master keys on the server.

13. Do not claim cryptographic guarantees that the implementation cannot provide.

14. Keep authentication tokens separate from encryption keys.

15. Every cryptographic format must be versioned so algorithms can be migrated later.

Example:

{
"version": 1,
"algorithm": "...",
"ciphertext": "...",
"nonce": "..."
}

16. Cryptographic architecture changes require explicit review.

17. When uncertain about a security-sensitive decision, stop implementation and surface the decision rather than selecting a weaker design silently.

---

# 35. RECOMMENDED IMPLEMENTATION ORDER

Coding agents should NOT begin by building the entire UI.

Recommended order:

Phase A — Architecture

1. Define threat model.
2. Define trust boundaries.
3. Define cryptographic envelope formats.
4. Define key hierarchy.
5. Define account/key lifecycle.
6. Define sharing protocol.
7. Define invitation protocol.
8. Define revocation protocol.
9. Define revision encryption model.
10. Define CLI key provisioning strategy.

Phase B — Crypto Prototype

Implement isolated proof-of-concept tests for:

User key generation.

Password-derived key.

Private key encryption.

Vault key generation.

Vault key wrapping.

Secret encryption.

Secret decryption.

Vault sharing.

Vault revocation.

Revision restoration.

Do not connect production database yet.

Phase C — Data Model

Design:

User
UserKey
Vault
VaultMembership
VaultKeyEnvelope
Environment
Revision
EncryptedPayload
SecretFile
Invitation
AuditEvent

Phase D — Backend

Build authorization and encrypted-storage APIs.

Phase E — Web Client

Build client-side cryptographic layer and UI.

Phase F — Version Control

Build revision creation, comparison, conflict handling and restoration.

Phase G — Export

Implement client-side `.env` and JSON generation.

Phase H — Security Review

Perform:

* Threat-model review.
* Crypto-flow review.
* Authorization testing.
* Logging review.
* Browser-storage review.
* Dependency review.
* XSS review.

Only after these phases should CLI implementation begin.

---

# 36. PRIMARY THREAT MODEL

Env Vault must explicitly defend against:

## Database Compromise

Attacker obtains complete database.

Expected result:

Attacker cannot decrypt secrets.

## Object Storage Compromise

Attacker obtains encrypted files.

Expected result:

Attacker cannot decrypt files.

## Backend Read Access

Attacker gains ability to inspect stored backend data.

Expected result:

No plaintext secrets available.

## Unauthorized User

User attempts to access vault without membership.

Expected result:

Server denies encrypted payload access.

## Removed Member

Former member attempts to access new revisions.

Expected result:

No access after successful vault-key rotation.

## Network Attacker

TLS remains mandatory even though payloads are encrypted.

## Logging/Analytics Leakage

Expected result:

No secret values enter logs or analytics.

## XSS

XSS is a critical threat because cryptography occurs in the browser.

A successful XSS attack may access decrypted secrets or key material in memory.

Therefore the web application requires unusually strict:

* Content Security Policy.
* Dependency control.
* Script restrictions.
* XSS prevention.
* No unnecessary third-party scripts on cryptographic pages.

This is one of the highest-priority security risks in the architecture.

---

# 37. SECURITY NON-GOALS

Env Vault cannot prevent:

* Authorized users manually copying exported secrets.
* Malware running on an authorized user's device.
* Compromised browsers reading client-side decrypted data.
* Users sharing downloaded `.env` files.
* Former members retaining secrets they accessed before revocation.
* Screenshots or screen recording of non-secret metadata.
* A malicious authorized user modifying secrets they have permission to modify.

These limitations must not be represented as solvable through encryption alone.

---

# 38. DEFINITION OF MVP SUCCESS

The MVP is successful when:

1. A user can create an account.

2. A user can create an encrypted vault.

3. A user can create Development, Staging and Production environments.

4. A user can import `.env` data.

5. Secret names and values are encrypted before storage.

6. The server cannot decrypt stored secrets.

7. A user can invite another user.

8. The invited user can cryptographically access the vault.

9. A user can remove another member and rotate future access.

10. Users can modify environment variables.

11. Every committed modification creates an immutable revision.

12. Revision history identifies added, removed, renamed and modified keys without revealing values.

13. Users can restore an old revision without deleting history.

14. Users can export an environment as `.env`.

15. Users can export an environment as JSON.

16. Export generation occurs locally.

17. The web UI never provides a standard plaintext secret reveal interface.

18. Audit logs contain no plaintext secret material.

19. A complete database dump is insufficient to decrypt vault secrets without user-held cryptographic material.

---

# 39. FINAL ENGINEERING PRINCIPLE

When choosing between developer convenience and weakening the zero-knowledge architecture, the implementation must preserve the security architecture.

If a requested feature requires the server to read plaintext secrets, that feature must be redesigned or explicitly rejected.

Env Vault should be built around one invariant:

> The infrastructure stores secrets. The authorized client understands them.

All future architecture decisions should preserve this invariant.
