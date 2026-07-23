# envvault

Zero-knowledge secrets CLI for [Env Vault](https://github.com/theDevSoham/env-vault). Pull `.env` secrets and inject them into processes — all decryption happens locally; the server only ever serves ciphertext.

## Install

```bash
npm install -g envvault
```

Requires Node ≥ 20.

## Authentication

Login uses a browser device-authorization flow — no passwords on the command line:

```bash
envvault login                     # prints a code + key fingerprint
```

Open the Env Vault web app's **Devices** page, enter the code, and confirm the fingerprint matches the one printed in your terminal before approving. Your credentials are stored at `~/.envvault/credentials.json` (mode 0600). The user private key is never stored unwrapped.

## Commands

```bash
envvault vaults                                    # list vaults (names decrypted locally)
envvault envs --vault <id|name>                    # list environments
envvault pull --vault V --env E [--format env|json] [--out PATH|-]
                                                   # decrypt and write secrets (PLAINTEXT file)
envvault run --vault V --env E -- <cmd…>           # run a command with secrets injected in-memory
envvault logout                                    # revoke this device + delete local credentials
```

Prefer `envvault run` over `pull` — it injects secrets into the child process environment without writing a plaintext file to disk.

## CI / service accounts

For pipelines, create a **service account** in the web UI and set its one-time credential as the `ENVVAULT_CREDENTIALS` environment variable. The CLI then runs non-interactively (no login, no local file):

```yaml
env:
  ENVVAULT_CREDENTIALS: ${{ secrets.ENVVAULT_CREDENTIALS }}
run: envvault run --vault "Acme Project" --env Production -- npm run build
```

## Security

Env Vault is zero-knowledge: the infrastructure stores encrypted data it cannot read. Revoking a device removes its token immediately; if a device already decrypted keys it may retain them, so rotate the vault key (remove the member) for cryptographic certainty. Losing your account password means losing access — there is no server-side recovery.
