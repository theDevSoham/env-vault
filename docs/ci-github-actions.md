# Env Vault — CI / GitHub Actions Usage

**Status:** Final (Phase 2, 2026-07-23)
**Prerequisite:** a service account credential ([machine-identities.md](machine-identities.md) §1), created by a vault owner in the web UI and stored as a CI secret.

---

## How it works

The CLI's non-interactive mode reads `ENVVAULT_CREDENTIALS` — the base64 machine-credential blob containing the service account's keypair and bearer token. Decryption happens **inside the CI job** (the trusted client context for a machine); the Env Vault server only ever serves ciphertext. No login flow, no local credential file.

Preferred pattern: `envvault run` injects secrets into the child process **without writing a `.env` file** (handoff §26). Use `pull` only when a tool genuinely requires a file, and understand the runner then holds a plaintext copy.

## GitHub Actions example

```yaml
name: build
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4          # your app repo (contains/installs the envvault CLI)
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci

      # Secrets exist only in the child process environment — no file on the runner
      - name: Build with injected secrets
        env:
          ENVVAULT_CREDENTIALS: ${{ secrets.ENVVAULT_CREDENTIALS }}
        run: npm run cli -- run --vault "Acme Project" --env Production -- npm run build
```

## Secret-handling guidance

- Store the credential **only** in the CI provider's secret store; never commit it or echo it.
- Scope narrowly: one service account per pipeline per vault; set a membership expiry at creation for time-boxed projects.
- GitHub masks `secrets.*` in logs, but your build must not print the injected variables either — the same discipline as any secret.
- **Rotation & revocation:** revoking the SA kills its token immediately (authorization). If the credential may have leaked, also rotate the vault key (remove the SA via the member-removal flow) — that is the cryptographic guarantee (handoff §20).
- Fork PRs: GitHub does not expose secrets to fork-triggered workflows by default — keep it that way.

## Why there is no marketplace Action (V1 decision)

A wrapper action would only re-package the two lines above while adding a third-party supply-chain link into the exact place secrets flow. The CLI's env-var mode *is* the integration surface; a published action may come with public packaging (ADR-008 follow-ups).
