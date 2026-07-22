# Env Vault — Account & Key Lifecycle

**Status:** Draft (Phase A)
**Resolves:** O2 (auth strategy, [ADR-002](decisions/adr-002-auth-strategy.md))
**Depends on:** [crypto-spec.md](crypto-spec.md) §3 key hierarchy

---

## 1. Signup

Client-side, in order:

1. Generate `kdfParams` (fresh 16-byte salt, ADR-003 parameters).
2. `masterKey = deriveMaster(password, kdfParams)`; `{ kek, authKey } = splitMaster(masterKey)`.
3. `{ publicKey, privateKey } = generateUserKeypair()`.
4. `encPrivKey = encryptPrivateKey(privateKey, kek)`.
5. Send to server: `{ email, authKey, kdfParams, publicKey, encPrivKey }`.

Server stores: `email`, `authVerifier = serverHash(authKey)` (Argon2id server-side with its own salt), `kdfParams`, `publicKey`, `encPrivKey`.

Server never receives: `password`, `masterKey`, `kek`, `privateKey`.

> `authKey` transits TLS like any password would, but by construction reveals nothing about `kek` (domain-separated KDF). The server re-hashes it, so a DB dump contains no login-usable credential either.

**Signup UX must display the honest warning (threat model L1):** losing the password permanently loses access to encrypted data; there is no server-side recovery.

## 2. Login & unlock

1. Client requests `kdfParams` for `email`. Unknown emails receive a **deterministic dummy** (HMAC of email under a server secret → fake salt, standard params) to blunt user enumeration (threat model T10).
2. Client derives `masterKey` → `authKey`, `kek`.
3. Client submits `authKey`; server verifies against `authVerifier`, issues an HttpOnly session cookie. Session tokens grant API access only — they can never decrypt anything (handoff §23).
4. Client fetches `encPrivKey`, decrypts with `kek` → private key held **in memory only**.

Wrong password manifests as *both* failed auth and failed private-key decryption; the auth failure is what the user sees.

**Unlock lifetime:** in-memory keys vanish on tab reload/close; the session cookie may outlive them. UI must handle "authenticated but locked" by re-prompting for the password (re-derive, re-decrypt — no network auth needed if session is live).

## 3. Password change

Client-side, requires current password:

1. Derive old `masterKey` (verify by decrypting `encPrivKey`).
2. Generate fresh salt → new `kdfParams`, derive new `masterKey'` → `kek'`, `authKey'`.
3. `encPrivKey' = encryptPrivateKey(privateKey, kek')`.
4. Send `{ oldAuthKey, newAuthKey, newKdfParams, newEncPrivKey }`; server verifies old, replaces all three **in one transaction**.

Vault keys and all vault data are untouched (the keypair is unchanged). All other sessions are invalidated.

## 4. KDF parameter upgrades

`kdfParams` is versioned per user. On login, if stored params are weaker than current policy, the client transparently performs the password-change flow (§3) with the same password and upgraded params. Policy history is documented in ADR-003.

## 5. Account recovery (V1 posture)

- **No recovery of encrypted data.** No escrow, no admin reset that preserves data (handoff §34.12).
- Password reset (proving email control) may create a **new** keypair going forward, but all previously encrypted data is unrecoverable and vault memberships must be re-established by vault owners (re-invite → re-wrap). The UI must state this in plain language before the user confirms.
- Post-V1 option (not built now): user-held recovery code — a random 32-byte key generated client-side that also wraps the private key; stored only by the user. Never server-recoverable.

## 6. Account deletion

Delete: auth record, key records, memberships, invitations. Vaults where the user is the sole owner require explicit vault deletion or ownership transfer first. Audit events persist (actor id retained; see data-model phase for retention decision).

## 7. Server-side rules

- `authKey` is treated with full password discipline: never logged, immediately hashed, never stored raw.
- Rate limiting + lockout backoff on login and on the `kdfParams` lookup endpoint.
- Session cookies: HttpOnly, Secure, SameSite=Lax minimum.
