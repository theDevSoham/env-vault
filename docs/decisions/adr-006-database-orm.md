# ADR-006 — Database: Neon Postgres + Drizzle ORM (node-postgres driver)

**Status:** Accepted (Phase C) · **Resolves:** O3 · **Date:** 2026-07-23

## Context

Phase C needs a relational store with: transactional multi-row writes (atomic key rotation, handoff §34.11), enforceable append-only history, unique-constraint-backed revision numbering (concurrency, handoff §30), and JSON storage for ciphertext envelopes. The user provisioned a managed Postgres instance on Neon (dev). ORM candidates: Prisma vs Drizzle (user delegated the choice).

## Decision

- **Postgres** (Neon-managed for dev; nothing Neon-specific in code — any Postgres works).
- **Drizzle ORM** with the standard `pg` (node-postgres) driver and **drizzle-kit** migrations.
- Connection string lives in `.env` (`DATABASE_URL`, gitignored; `.env.example` documents the shape). TLS pinned to `sslmode=verify-full`.

## Why Drizzle over Prisma

- **SQL-level control is a security feature here:** append-only triggers on revisions/audit, `SELECT … FOR UPDATE` in the rotation transaction, and partial unique indexes are first-class in Drizzle's migration SQL; Prisma pushes these to escape-hatch raw SQL outside its schema model.
- **Interactive transactions** map directly (`db.transaction`) with no engine intermediary; the atomic rotation commit is the single most sensitive write path in the system.
- **Lighter runtime** (plain TS, no codegen step or query engine) — fewer moving parts inside the trust-critical backend, faster cold starts on serverless.
- Prisma's DX advantages (studio, schema DSL) matter less in a schema this small (11 tables) that is security-reviewed by hand anyway.

## Consequences

- Migrations are SQL files under `drizzle/` — reviewable diff-by-diff (good for Phase H).
- Repos in `src/lib/db/` are the only query surface; app code never imports `drizzle-orm` directly (mirrors the crypto-module isolation rule).
- drizzle-kit is dev-only tooling; it never runs in production paths.
