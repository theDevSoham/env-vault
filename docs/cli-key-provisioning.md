# Env Vault — CLI Authentication & Key Provisioning (Design Sketch)

**Status:** Sketch (Phase A — resolves O8 at approach level). Must be finalized and reviewed before any Phase 1.5 code (handoff §25; gate in [plannings/09-phase-cli.md](../plannings/09-phase-cli.md)).

---

## 1. Requirements (handoff §24–26)

- No passwords on argv or in env vars (`envvault login --password …` is forbidden).
- Authentication tokens must never give the server decryption ability.
- The CLI must obtain decryption capability through a client-to-client cryptographic path — the server only relays ciphertext.

## 2. Approach: device authorization + device keypair wrap

Treat the CLI as a **device** with its own X25519 keypair; provision it by having an already-trusted client (the user's unlocked browser session) wrap key material to the device's public key. Same envelope machinery as vault sharing — no new cryptography.

```
CLI                                  Server                        Browser (unlocked)
 │ generate device keypair             │                              │
 │ start device-auth ────────────────▶ │  user code: ABCD-EFGH        │
 │ display "ABCD-EFGH" + fingerprint   │ ◀──── user enters code ───── │
 │                                     │  shows device fingerprint ─▶ │ user verifies match
 │                                     │                              │ wraps user private key
 │                                     │ ◀── enc.box(privKey → devicePub)
 │ poll ─────────────────────────────▶ │                              │
 │ ◀── auth tokens + wrapped envelope  │                              │
 │ unwrap with device private key      │                              │
```

1. `envvault login`: CLI generates a device X25519 keypair locally, registers `{devicePubKey}`, receives a short user code, and displays the code **plus the device key fingerprint**.
2. User enters the code in the browser (authenticated + unlocked). Browser displays the device fingerprint; user confirms it matches the terminal — this defeats a server substituting its own device key (threat-model T9 applied to devices).
3. Browser wraps the **user private key** as `enc.box(privateKey → devicePubKey)` and uploads it tagged to the device grant. (Wrapping the user private key rather than individual vault keys means the CLI transparently follows vault-key rotations by unwrapping current envelopes, like the web client.)
4. CLI polls, receives auth tokens + the wrapped envelope, unwraps locally. Server saw only ciphertext.

## 3. Local storage at rest

- Device private key + unwrapped user private key: stored in the OS keychain where available (DPAPI/Keychain/libsecret); fallback: file encrypted under a key held in the keychain. Exact scheme finalized pre-1.5.
- Auth tokens stored separately from key material (handoff §34.14).
- `envvault logout` deletes tokens and key material; server side revokes the device grant.

## 4. Device management

Server tracks device grants (name, created, last used). Users can revoke a device from the web UI: revokes tokens + deletes the wrapped envelope. A revoked device that already unwrapped the private key must be assumed to retain it (same honesty as member revocation → rotating affected vault keys is the true remedy; UI should offer it).

## 5. Constraints this sketch imposes on Phases A–E (why it exists now)

- Envelope machinery must support wrapping arbitrary payloads to arbitrary registered public keys (not only vault keys to members) — satisfied by `enc.box` being payload-agnostic.
- Nothing in the auth design may assume the browser is the only client.
- Fingerprint display must be a reusable UI/crypto primitive (used for members and devices).
