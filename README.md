# Env Vault

Zero-knowledge encrypted storage and sharing for `.env` secrets and secret files, built for individual developers and small teams.

**The invariant:** the infrastructure stores secrets; only authorized clients can understand them. All encryption and decryption happens in the browser — the server, database, and object storage hold ciphertext, wrapped keys, and non-secret metadata only. A complete database dump is not sufficient to decrypt vault contents.

**What Env Vault does — and doesn't — promise:** the backend cannot decrypt your secrets, and the web UI never displays secret values. It does *not* claim that authorized members can't extract plaintext (they can — export exists precisely for that), that a lost password is recoverable (it isn't; keys derive from it), or that removed members forget what they already saw (key rotation protects future changes only).

## Features (V1)

- Client-side encrypted vaults, environments, secret key/values and files (names encrypted too)
- Sharing via per-member wrapped vault keys; invitations for existing and not-yet-registered users
- Member removal with atomic vault-key rotation
- Immutable revision history with structural diffs (never values), comparison, and restore
- Local `.env` / JSON export; `.env` import
- Append-only audit log containing metadata only

## Development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL (Postgres) and SERVER_SECRET
npx drizzle-kit migrate
npm run dev
```

`npm test` runs the suite (crypto, DB and API integration tests; the latter need `DATABASE_URL`).

## Documentation

Start at [AGENTS.md](AGENTS.md) (repository map), then [ARCHITECTURE.md](ARCHITECTURE.md) and [docs/](docs/INDEX.md) — threat model, crypto spec, protocol documents and decision records live there.
