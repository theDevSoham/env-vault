# Env Vault — Cryptographic Specification

**Status:** Draft (Phase A) — binding for Phase B implementation; changes require explicit review (handoff §34.16)
**Resolves:** O1 (library, [ADR-001](decisions/adr-001-crypto-library.md)), O5 (KDF params, [ADR-003](decisions/adr-003-argon2id-params.md))

---

## 1. Libraries & primitives

Per [ADR-001](decisions/adr-001-crypto-library.md), a hybrid of two audited implementations, wrapped by the single module `src/lib/crypto/`:

| Purpose | Primitive | Implementation |
|---|---|---|
| Password KDF | Argon2id (v1.3) | libsodium `crypto_pwhash` |
| Key splitting | KDF w/ domain separation | libsodium `crypto_kdf_derive_from_key` (BLAKE2b) |
| Symmetric AEAD (records) | AES-256-GCM | WebCrypto `AES-GCM` (native) |
| Symmetric AEAD (file streaming) | XChaCha20-Poly1305 secretstream | libsodium `crypto_secretstream_*` |
| Asymmetric wrap | X25519 sealed box | libsodium `crypto_box_seal` / `crypto_box_seal_open` |
| Randomness | CSPRNG | `crypto.getRandomValues` / `randombytes_buf` only |

No other primitive may be used. No code outside `src/lib/crypto/` may import libsodium or call `crypto.subtle`.

## 2. Versioned envelope formats (handoff §34.15)

Every ciphertext at rest is one of these JSON envelopes. Unknown `v` or `alg` → hard error, never silent fallback.

### 2.1 Symmetric record envelope (`enc.rec`)

```json
{
  "v": 1,
  "t": "enc.rec",
  "alg": "A256GCM",
  "kid": "<vault-id>:<key-generation>",   // or "kek:<user-id>" for private-key encryption
  "n": "<base64url 12-byte nonce>",
  "aad": "<base64url of the AAD actually used>",
  "ct": "<base64url ciphertext+tag>"
}
```

### 2.2 Asymmetric wrap envelope (`enc.box`)

```json
{
  "v": 1,
  "t": "enc.box",
  "alg": "X25519-SEALED",                 // crypto_box_seal: ephemeral X25519 + XSalsa20-Poly1305
  "rcp": "<base64url recipient public key>",
  "ct": "<base64url sealed ciphertext>"
}
```

### 2.3 Stream envelope for files (`enc.stream`)

```json
{
  "v": 1,
  "t": "enc.stream",
  "alg": "XCHACHA20-POLY1305-SECRETSTREAM",
  "kid": "<vault-id>:<key-generation>",
  "hdr": "<base64url secretstream header>",
  "chunk": 4194304                        // plaintext chunk size in bytes (4 MiB)
}
```
Ciphertext chunks live in object storage; this envelope is the DB-side metadata.

### 2.4 KDF parameter record (stored per user, plaintext)

```json
{
  "v": 1,
  "alg": "argon2id13",
  "salt": "<base64url 16 bytes>",
  "ops": 3,
  "mem": 67108864,      // bytes (64 MiB) — see ADR-003
  "outLen": 32
}
```

## 3. Key hierarchy

```
password ──Argon2id(salt, params)──▶ masterKey (32 B)          [never leaves client, never stored]
                 │
                 ├─ crypto_kdf(ctx="envkek00", id=1) ─▶ KEK (32 B)      encrypts user private key
                 └─ crypto_kdf(ctx="envauth0", id=1) ─▶ authKey (32 B)  sent to server as login credential
                                                                        (server re-hashes it; see account-key-lifecycle.md)
userKeypair = X25519 (pub stored plaintext server-side; priv stored as enc.rec under KEK)
vaultKey    = 32 B CSPRNG, per vault, per generation
              stored only as enc.box envelopes, one per (member, generation)
```

- Domain separation between `authKey` and `KEK` guarantees the login credential reveals nothing about the encryption key (handoff §23).
- **Key generations:** each vault key has integer generation `g` starting at 1, incremented on rotation. Every envelope carries `kid = "<vault-id>:<g>"`. Members hold envelopes for every generation they are entitled to (so old revisions stay readable — handoff §21).

## 4. Nonce strategy (handoff §15, §34.9)

- AES-GCM: 12-byte nonce from CSPRNG, fresh per encryption, never cached/derived/counter-based (counters can't be coordinated across clients). Random-nonce collision bound: negligible below ~2^32 encryptions per key; per-vault-key operation counts are orders of magnitude lower, and key rotation further shortens key lifetimes. Bound documented here; a test asserts uniqueness over large batches (Phase B4).
- secretstream: nonce management is internal to the construction (header + ratchet); never reuse a header/key pair — a fresh stream per file version.
- Nonces are always generated inside `src/lib/crypto/`; callers cannot supply them.

## 5. Environment snapshot format (Model B — names AND values encrypted)

Plaintext form (exists only in client memory):

```json
{
  "v": 1,
  "keys": [
    { "id": "<stable random 8-byte id, base64url>", "name": "DATABASE_URL", "value": "postgres://..." }
  ]
}
```

- `id` is a per-key stable random identifier assigned at key creation, preserved across renames. This makes rename detection exact (rename = same `id`, new `name`) with no heuristics.
- Serialized (UTF-8 JSON) → encrypted as one `enc.rec` under the vault key.
- **AAD binding:** `aad = "snap:<vault-id>:<env-id>:<revision-number>"` — prevents transplanting ciphertext between environments/revisions (a compromised DB cannot swap snapshots undetected).

## 6. Structural diff metadata format

Computed client-side between two decrypted snapshots (by `id`):

```json
{
  "v": 1,
  "added":   ["STRIPE_WEBHOOK_SECRET"],
  "removed": ["LEGACY_API_KEY"],
  "renamed": [ { "from": "JWT_SECRET", "to": "AUTH_SECRET" } ],
  "modified": ["DATABASE_URL"]
}
```

Contains key **names only — never values**. Encrypted as `enc.rec` under the vault key with `aad = "diff:<vault-id>:<env-id>:<revision-number>"`, stored alongside the snapshot, decrypted client-side to render revision history (handoff §9, §29).

## 7. Encrypted names (ADR-004)

Vault names, environment names, and secret filenames are encrypted as `enc.rec` under the vault key with AADs `"vname:<vault-id>"`, `"ename:<vault-id>:<env-id>"`, `"fname:<vault-id>:<file-id>"`. List endpoints return envelopes; clients decrypt for display after unwrapping the vault key.

## 8. File encryption (handoff §22)

- Chunked: 4 MiB plaintext chunks through one secretstream (`enc.stream`); memory stays bounded for large files.
- Final chunk uses the secretstream `FINAL` tag — truncation is therefore detectable.
- Object storage receives only ciphertext chunks; DB stores the stream envelope + encrypted filename.

## 9. Crypto module public API (implemented in Phase B)

```
deriveMaster(password, kdfParams) → { masterKey }
splitMaster(masterKey) → { kek, authKey }
generateUserKeypair() → { publicKey, privateKey }
encryptPrivateKey(privateKey, kek) / decryptPrivateKey(env, kek)
generateVaultKey() → vaultKey
wrapVaultKey(vaultKey, recipientPublicKey) / unwrapVaultKey(env, keypair)
encryptSnapshot(snapshot, vaultKey, aadParts) / decryptSnapshot(env, vaultKey, aadParts)
diffSnapshots(before, after) → diff
encryptDiff / decryptDiff, encryptName / decryptName
fileEncryptStream(vaultKey) / fileDecryptStream(vaultKey, header)
```

All functions throw typed errors (`CryptoError` subtypes); none log inputs. Callers never see raw nonces/keys except the opaque key objects above.

## 10. Forbidden (restating handoff §14, §34)

Raw SHA-256/MD5/SHA-1 for passwords; custom constructions; nonce reuse; caller-supplied nonces; primitives outside `src/lib/crypto/`; plaintext key material in any serialized/persisted form; unversioned ciphertext.
