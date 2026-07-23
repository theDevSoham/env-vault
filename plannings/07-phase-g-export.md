# 07 — Phase G: Export

**Status: DONE (2026-07-23)** — see [worklog/phase-g-export__worklog_2026-07-23.md](../worklog/phase-g-export__worklog_2026-07-23.md)

**Goal:** client-side `.env` and JSON export (handoff §8, §35 Phase G). Generation happens entirely in the browser after local decryption; nothing plaintext returns to the server.

**Dependencies:** Phase E. **Blocks:** H.

## Steps

### G1. Export engine (client-only)
- [x] `.env` serializer with correct quoting/escaping (newlines, quotes, `#`, spaces, backslashes) — built in Phase E (`envformat.ts`), round-trip unit-tested.
- [x] JSON serializer: flat `{ "KEY": "value" }`.
- [x] `exportEnvironment` flow: decrypt head snapshot in memory → serialize → return text for local download; audit call is best-effort and never blocks the export.

### G2. UI
- [x] "Download .env" / "Download JSON" buttons on the environment page (members and owners — handoff §6); disabled at revision 0.
- [x] Download via client-generated Blob + object URL — no server round-trip with plaintext (handoff §8).
- [x] Persistent notice under the buttons: "Generated locally — the download is a plaintext copy you now control" (handoff §4/§26/§37 honesty).

### G3. Audit
- [x] `export_requested` audit event with metadata only (environment id + format — schema-enforced server-side; handoff §27).

## Exit criteria

- [x] MVP criteria #14, #15, #16 verified **in the browser**: captured the generated blobs — `.env` produced exactly `DATABASE_URL=…\nJWT_SECRET=…\n`, JSON the flat object equivalent, matching the decrypted head revision.
- [x] Network inspection during both exports: only ciphertext GETs (vault detail + revision) and the two metadata-only audit POSTs — zero plaintext left the browser.
- [x] Round-trip: import `.env` → commit → export `.env` reproduces equivalent content (unit round-trip in `envformat.test.ts`; browser journey used staged keys + verified export content matches state).
- [x] Worklog entry written.
