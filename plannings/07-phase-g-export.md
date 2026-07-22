# 07 — Phase G: Export

**Goal:** client-side `.env` and JSON export (handoff §8, §35 Phase G). Generation happens entirely in the browser after local decryption; nothing plaintext returns to the server.

**Dependencies:** Phase E. **Blocks:** H.

## Steps

### G1. Export engine (client-only)
- [ ] `.env` serializer: correct escaping/quoting rules (values with newlines, quotes, `#`, spaces); documented format decisions.
- [ ] JSON serializer: flat `{ "KEY": "value" }` object.
- [ ] Both build from the decrypted in-memory snapshot; memory cleared after download blob creation.

### G2. UI
- [ ] "Download as .env" / "Download as JSON" per environment (Owner and Member — handoff §6).
- [ ] Download via client-generated Blob/object URL; **no server round-trip with plaintext** (handoff §8).
- [ ] Brief user notice that the export is a plaintext copy they now control (aligns with handoff §4, §37).

### G3. Audit
- [ ] "Export requested" audit event (metadata only: vault, environment, format, actor — handoff §27).

## Exit criteria

- [ ] MVP criteria #14, #15, #16 pass.
- [ ] Network inspection during export shows zero plaintext leaving the browser.
- [ ] Round-trip test: import `.env` → commit → export `.env` reproduces equivalent content.
- [ ] Worklog entry written.
