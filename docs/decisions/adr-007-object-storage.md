# ADR-007 — Object storage: adapter interface, Postgres-backed blob store for V1

**Status:** Accepted (Phase C) · **Resolves:** O4 · **Date:** 2026-07-23

## Context

Encrypted secret files need blob storage (handoff §22). The architecture assumed S3-compatible object storage, but the only provisioned infrastructure is the Neon Postgres instance, and V1 file sizes are small (service-account JSONs, certificates, `.pem`s — kilobytes to a few megabytes) at 1–20 users.

## Decision

- Define a minimal **storage adapter interface** in `src/lib/storage/` (`putChunk` / `getChunk` / `deleteFile` keyed by file id + chunk index). It handles **opaque encrypted bytes only** — by the time bytes reach the adapter they are secretstream ciphertext.
- **V1 default implementation: Postgres-backed** (`file_chunks` table, `bytea` per 4 MiB ciphertext chunk) — zero extra infrastructure, chunks are transactional with file metadata.
- An S3-compatible adapter (R2/S3/B2) is a drop-in later behind the same interface when real object storage is provisioned; no schema or protocol change required.

## Consequences

- File bytes count against Postgres storage; acceptable at V1 scale (small config/cert files). If usage grows, switching adapters is an infrastructure task, not a redesign.
- Upload/download streams through the backend rather than pre-signed URLs for V1 — simpler authorization (the vault-membership guard covers chunks) at the cost of backend bandwidth. Pre-signed flows come with the S3 adapter.
- The threat model's "object storage compromise" scenario (T2) collapses into "database compromise" (T1) for V1 — same required outcome (ciphertext only), already enforced.

## Alternatives rejected

- **Adopt S3/R2 now:** no credentials exist; inventing a second managed service for kilobyte-scale V1 files adds surface without need.
- **Base64 blobs in jsonb:** ~33 % size overhead and no chunk-level streaming; `bytea` chunks keep memory bounded end-to-end.
