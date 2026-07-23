<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# ENV VAULT — AGENT ENTRY POINT

Env Vault is a **zero-knowledge** encrypted storage and sharing platform for `.env` secrets and secret files. All encryption/decryption happens client-side; the server must never be able to decrypt user secrets. This file is the map — start here, then follow the links.

**The one invariant:** *The infrastructure stores secrets. The authorized client understands them.* Never move crypto to the backend, never log plaintext, never add a secret-reveal UI. When a task would weaken the zero-knowledge architecture, stop and surface it instead of proceeding.

## Read order for a fresh agent session

1. This file (you are here).
2. [memories/INDEX.md](memories/INDEX.md) — context preserved from prior work sessions.
3. [ARCHITECTURE.md](ARCHITECTURE.md) — the technical architecture plan, decision log, and open decisions.
4. [plannings/INDEX.md](plannings/INDEX.md) — find the current phase and its concrete steps.
5. [worklog/INDEX.md](worklog/INDEX.md) — what has already been done.
6. [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) — full requirements; the source of truth when anything conflicts.

## Repository map

| Path | What it is |
|---|---|
| [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) | Product, security & engineering requirements (source of truth) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture plan: crypto design, domain model, phases, decisions |
| [docs/](docs/INDEX.md) | Bookkeeping documents (threat model, protocol specs, ADRs) — indexed in `docs/INDEX.md` |
| [plannings/](plannings/INDEX.md) | Concrete step-by-step plans per phase — indexed in `plannings/INDEX.md` |
| [worklog/](worklog/INDEX.md) | Completed work logs, `<feature/issue>__worklog_<YYYY-MM-DD>.md` — indexed in `worklog/INDEX.md` |
| [memories/](memories/INDEX.md) | Agent context preservation across sessions — indexed in `memories/INDEX.md` |
| `app/api/` | Backend route handlers — ciphertext only, guarded by `src/lib/api-server` (built Phase D) |
| `app/layout.tsx`, `app/page.tsx` | Root layout & landing page (scaffold, to be replaced) |
| `src/lib/api-server/` | Server framework: sessions, vault guard, validation, rate limits (built Phase D) |
| `src/lib/crypto/` | The single reviewed crypto module — sole owner of primitives (built Phase B; spec: `docs/crypto-spec.md`; tests in `__tests__/`, run `npm test`) |
| `src/lib/db/` | DB schema + server-only data access (built Phase C; Drizzle + Neon Postgres, ADR-006; integration tests need `DATABASE_URL` in `.env`) |
| `src/lib/storage/` | Object-storage adapter — encrypted blobs only (built Phase C; V1 = Postgres blob store, ADR-007) |
| `drizzle/` | SQL migrations (`drizzle-kit generate` / `migrate`); 0001 = append-only triggers |
| `src/lib/api/` | Typed client for backend endpoints — the only network path (built Phase E) |
| `src/lib/client/` | Client crypto orchestration: keystore (in-memory keys), flows, .env format (built Phase E) |
| `src/components/` | UI components — no crypto logic inside components; they call `src/lib/client/flows` |
| `proxy.ts` | Next 16 proxy (ex-middleware): nonce CSP + security headers (threat-model T8) |
| `cli/` | `envvault` CLI (`npm run cli -- <cmd>`): device-auth login, pull, run (built Phase 1.5; design: `docs/cli-key-provisioning.md`, ADR-008) |
| `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs` | Tooling config (Next 16.2.11, React 19, Tailwind 4, TS 5) |

## Working conventions

- **This file stays under 150 lines** (token budget — it loads every session). Keep entries to one line; details belong in ARCHITECTURE.md, `docs/`, `plannings/`, `worklog/` — link, don't inline.
- **Docs:** every document added to `docs/` gets a one-line entry in `docs/INDEX.md`.
- **Plans:** phase plans live in `plannings/`, numbered in execution order; update checkboxes as steps complete and keep `plannings/INDEX.md` statuses current.
- **Worklogs:** after completing a feature/issue, write `worklog/<feature-or-issue>__worklog_<YYYY-MM-DD>.md` (what was done, decisions made, files touched, follow-ups) and index it in `worklog/INDEX.md`.
- **Memories:** before ending a session mid-task (or when context may be lost), write a memory file in `memories/` following its index conventions so the next session can resume.
- **Security rules:** the 17 rules in PROJECT_HANDOFF.md §34 are binding. Open decisions in ARCHITECTURE.md §10 must be resolved explicitly, never silently.

## Commands

```bash
npm run dev     # dev server
npm run build   # production build
npm run lint    # eslint
```
