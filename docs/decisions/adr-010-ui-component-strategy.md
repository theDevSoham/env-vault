# ADR-010 — UI component strategy: custom in-repo kit, zero new runtime deps

**Status:** Accepted (UI restructure) · **Date:** 2026-07-23

## Context

The UI needed a full restructure into a cohesive design system. Options considered: shadcn/ui (vendored source over Radix runtime deps), Radix UI directly, DaisyUI (Tailwind CSS plugin), or a custom in-repo kit.

The constraint that dominates: Env Vault is zero-knowledge and decrypts secrets **in the browser**. Phase H ([security-review-v1.md](../security-review-v1.md) H6/H7) established that the only third-party code shipped to the client is `libsodium-wrappers-sumo` + the Next/React framework — no analytics, no CDN scripts — and that XSS is the highest-priority threat (T8), because a script on a key-material page can read decrypted secrets in memory.

## Decision

Build a **custom component kit in `src/components/ui/`** styled with Tailwind v4, adding **zero new runtime dependencies**. Design tokens live in `app/globals.css` via Tailwind v4 `@theme`.

## Consequences

- The Phase H invariant holds unchanged: no new client-shipped third-party package touches pages that handle key material. Nothing new to add to the dependency-review or supply-chain surface.
- We own the components — accessibility, focus management, and behavior are all reviewable in-repo alongside the crypto and CSP posture.
- More upfront work than importing a library, but the kit needed for this app is small (button, input, card, dialog, badge, table, toast, etc.).
- CSP unaffected: components are our own nonce-covered bundle; no inline scripts, no external origins. The pre-existing `style-src 'unsafe-inline'` exception (Phase E) is the only style caveat and is not widened.
- Native `confirm()`/`prompt()`/`alert()` are replaced by in-app dialogs — both a UX and a reliability improvement (native dialogs are blocked in some embedded/automated contexts).

## Alternatives rejected

- **shadcn/ui + Radix:** adds `@radix-ui/*` runtime packages to the client bundle — new supply-chain + XSS surface on key-material pages, reopening a closed Phase H concern for styling convenience.
- **DaisyUI:** CSP-safe (build-time CSS only) and was a genuine contender, but its opinionated class system fits a generic look; a tailored developer-tool aesthetic is cleaner with custom components. Revisitable if we want to move faster later — it adds no runtime JS.
- **Radix directly:** same runtime-dependency objection as shadcn without the vendored-source benefit.
