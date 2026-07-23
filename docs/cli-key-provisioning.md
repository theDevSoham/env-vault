# Env Vault — CLI Authentication & Key Provisioning

**Status:** Final (Phase 1.5, 2026-07-23) — supersedes the Phase A sketch; reviewed against threat-model T3/T5/T9/T10 before implementation per handoff §25.
**Related:** [ADR-008](decisions/adr-008-cli-runtime.md) (runtime & local storage), [revocation-protocol.md](revocation-protocol.md)

---

## 1. Requirements (handoff §24–26)

- No passwords on argv or in env vars. `envvault login` uses a browser device-authorization flow.
- Auth tokens never give the server decryption ability (handoff §23).
- Key material reaches the CLI only through client-to-client cryptography — the server relays ciphertext envelopes it cannot open.

## 2. Protocol

The CLI is a **device** with its own X25519 keypair. An unlocked browser session wraps the **user private key** to the device's public key (same `enc.box` sealed-box machinery as vault sharing — no new cryptography). Wrapping the private key (not individual vault keys) means the CLI transparently follows vault-key rotations by unwrapping current envelopes, exactly like the web client.

```
CLI                                Server                          Browser (unlocked)
 1 generate device keypair           │                                │
 2 POST /devices/start ────────────▶ │ userCode ABCD-EFGH             │
   {devicePubKey, name}              │ deviceId + pollSecret          │
 3 print code + FINGERPRINT          │ ◀── user enters code ───────── │ 4
 5 poll /devices/poll ─────────────▶ │  shows name + fingerprint ───▶ │ user compares with terminal
   {deviceId, pollSecret}            │ ◀── approve: enc.box(privKey → devicePub) + token issued
 6 ◀── {token, wrappedPrivKeyEnv}    │                                │
 7 store device privkey + envelope + token locally (ADR-008)
```

Per-step specification:

1. Device keypair: X25519 via the shared crypto module; generated fresh per `login`.
2. `POST /api/devices/start` (unauthenticated, rate-limited): body `{devicePubKey, name}` (name = `user@host`, display-only). Server creates a grant row: `state=pending`, random `userCode` (8 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, shown `XXXX-XXXX`), random 32-byte `pollSecret`, 10-minute expiry. Returns `{deviceId, userCode, pollSecret}`.
3. CLI prints the code **and the device-key fingerprint** (BLAKE2b-64, `XXXX-XXXX-XXXX-XXXX` — same primitive as member fingerprints).
4. User (authenticated + unlocked in the browser) enters the code at `/devices`. The page displays the device **name and fingerprint**; the user confirms the fingerprint matches the terminal. This defeats a malicious/compromised server substituting its own device key (T9 applied to devices): the server never sees the fingerprint comparison.
5. On approval the browser wraps the in-memory user private key: `enc.box(privateKey → devicePubKey)`, uploads it; the server marks the grant `approved`, generates a 32-byte device token, and stores only the token's BLAKE2b hash (same discipline as sessions).
6. `POST /api/devices/poll` `{deviceId, pollSecret}` (pollSecret prevents third parties polling a guessed id) returns `pending`, `denied|expired`, or — once — `{token, wrappedPrivKeyEnv}`.
7. CLI persists per ADR-008. Subsequent API calls send `Authorization: Bearer <token>`; the server resolves it against grant-token hashes (separate lookup path from web cookies — device tokens are revocable individually).

## 3. Server state & endpoints

`device_grants` table: id, userId (null until approved), name, devicePubKey, userCode, pollSecretHash, tokenHash (null until approved), wrappedPrivKeyEnv (enc.box, null until approved), state (`pending|approved|denied|revoked|expired`), createdAt, expiresAt, lastUsedAt.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/devices/start` | none (rate-limited) | create pending grant |
| `POST /api/devices/poll` | deviceId + pollSecret | poll for approval; returns token+envelope exactly once |
| `GET  /api/devices/pending?code=` | session | look up a pending grant by code (name + pubkey for fingerprint) |
| `POST /api/devices/[id]/approve` | session | attach `{wrappedPrivKeyEnv}`; issue token |
| `POST /api/devices/[id]/deny` | session | reject a pending grant |
| `GET  /api/devices` | session | list my grants (name, created, lastUsed, state) |
| `POST /api/devices/[id]/revoke` | session | revoke: delete token hash + envelope |

Audit events: `device_approved`, `device_revoked` (metadata: device id + name).

## 4. Local storage at rest (ADR-008 decision)

`~/.envvault/credentials.json`, file mode `0600`, containing: server URL, deviceId, device private key, the wrapped private-key envelope, and the bearer token. The **user private key is never stored unwrapped** — each CLI invocation opens the sealed box in memory and drops it on exit.

**Documented deviation from the Phase A sketch** (explicit, not silent): the sketch preferred OS keychains (DPAPI/Keychain/libsecret). V1 ships the 0600-file approach because a cross-platform keychain dependency is a large native-code surface for marginal V1 gain, and the dominant threat (another local user) is addressed by file permissions on POSIX. Limitations documented to users: on Windows, ACLs are not tightened by `0600`-style chmod; any process running as the user can read the file (equally true of keychain access without per-item prompts — threat-model N2). Keychain integration is the planned upgrade, tracked for Phase 2.

## 5. Token & revocation semantics

- Device tokens: 90-day expiry, per-device, hash-only at rest, refreshed by re-login. Separate from web sessions. **Password change does not invalidate device grants** — the envelope wraps the raw private key, which a password change re-encrypts but does not replace. Users changing their password due to suspected compromise must review the devices page and revoke explicitly; the password-change UI copy points there.
- `envvault logout`: deletes local credentials and calls revoke.
- Web-side revoke removes token + envelope. **Honest limitation** (as member revocation): a device that already unwrapped the private key may retain it; the true remedy is rotating the affected vaults' keys, and the devices UI says so.

## 6. Command surface (V1)

`login [--server URL]`, `logout`, `vaults`, `envs --vault`, `pull --vault --env [--format env|json] [--out PATH|-]` (writes plaintext **with an explicit warning**, handoff §26), `run --vault --env -- <cmd…>` (secrets only in the child process environment; nothing written to disk).

## 7. Explicitly rejected

- `--password` flags or password prompts in the CLI (handoff §25).
- Server-side wrapping or key escrow in any flow state.
- Storing the unwrapped user private key or any vault key on disk.
