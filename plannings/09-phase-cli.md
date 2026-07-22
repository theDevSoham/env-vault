# 09 — Phase 1.5: CLI

**Goal:** `envvault` CLI with secure login and local-only decryption (handoff §24–26). Architecturally first-class, delivered only after Phase H.

**Dependencies:** Phase H complete; `docs/cli-key-provisioning.md` finalized and reviewed. **Blocks:** nothing in V1.

> ⛔ Gate: the CLI key-provisioning design (open decision O8) must be a reviewed document **before** implementation starts (handoff §25). Auth tokens must not let the server decrypt or serve plaintext.

## Steps

### CLI-1. Security design finalization
- [ ] Finalize `docs/cli-key-provisioning.md`: device-authorization login (user code in browser, e.g. `ABCD-EFGH`), how the CLI obtains private-key material locally, local key storage format + protection at rest.
- [ ] Explicitly reject password-on-argv patterns (`--password`).

### CLI-2. Foundation
- [ ] Choose runtime/distribution (Node single-binary vs npm package) — ADR.
- [ ] `envvault login` — device flow end-to-end; token storage separate from key material.
- [ ] Local crypto: reuse the same primitives/spec as `src/lib/crypto/` (shared package or port with shared test vectors).

### CLI-3. Read commands
- [ ] `envvault vault list`
- [ ] `envvault env list`
- [ ] `envvault pull --environment <name> --format env|json` — decrypt locally, write file, **warn that a plaintext copy is being written** (handoff §26).

### CLI-4. Run injection (stretch within 1.5)
- [ ] `envvault run -- <cmd>` — inject secrets into child process env only; no file written.

## Exit criteria

- [ ] Login never accepts passwords via argv/env; server never gains decryption ability.
- [ ] `pull` output matches web export byte-semantics (shared test vectors).
- [ ] Docs updated; worklog entry written.
