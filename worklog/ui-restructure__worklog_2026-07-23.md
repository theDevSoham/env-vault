# UI Restructure · Worklog · 2026-07-23

**Plan:** [plannings/11-ui-restructure.md](../plannings/11-ui-restructure.md) (U1–U5 complete)
**Decision:** [ADR-010](../docs/decisions/adr-010-ui-component-strategy.md)

## What was done

Full presentation-layer overhaul into a cohesive dark developer-tool design system, with **zero new runtime dependencies** — a deliberate choice to preserve the Phase H invariant that the only client-shipped third-party code is libsodium + the framework (a component library's runtime packages would reopen the XSS/supply-chain surface on key-material pages). Flows and behavior are unchanged.

## Decision: custom kit over shadcn/Radix/DaisyUI

ADR-010. shadcn/Radix add `@radix-ui/*` runtime deps to the client bundle — new surface on pages that decrypt secrets. DaisyUI (CSS-only, CSP-safe) was a real contender but its opinionated look fits a generic app; custom gives a tailored aesthetic. Built a small in-repo kit styled with Tailwind v4 `@theme` tokens.

## What shipped

- **Design tokens** (`globals.css` `@theme`): surface layers, emerald accent, semantic tones, radii, shadow, focus ring, custom scrollbars, keyframes.
- **Component kit** (`src/components/ui/`): Button, Input/Textarea, Field/Label, Card(+Header/Body), Badge, Spinner, EmptyState, **Dialog** (portal + focus trap + Esc/overlay/scroll-lock), **useConfirm** (confirm + prompt), **ToastProvider/useToast**, CopyField, `cn` helper.
- **Shell**: AppShell (sticky nav) + PageHeader; Providers at root layout.
- **All pages redesigned**: landing (hero + features), login/signup (centered card; kept no-recovery acknowledgement), vaults (card grid + invitations), vault detail (sectioned cards), environment (refined editor + history/compare/restore), devices, UnlockGate.
- **Replaced all 8 native `confirm()`/`prompt()`** with in-app dialogs — a reliability win too (native dialogs are blocked when the browser pane isn't focused, which bit earlier verification passes).

## Notable fix (Tailwind v4)

First pass used `bg-[--color-x]` arbitrary classes; **v4 does not resolve a bare `--var` in brackets to `var(--var)`** — primary buttons rendered transparent, radii were 0. Converted every token reference to the utilities `@theme` generates (`bg-accent`, `border-border`, `rounded-lg`, `shadow-pop`, `border-danger/40`) via a scripted replacement across 24 files. Verified by computed styles: accent `rgb(16,185,129)`, button radius 6.4px, dialog radius 14.4px.

## Verification (browser, live)

Logged in → shell nav (Env Vault / Vaults / Devices) + vault card with owner badge → opened vault → four sectioned cards (Environments, Members, Service accounts, Secret files) → triggered **Delete vault** → custom modal opened (`role=dialog`, correct title/buttons, `--radius-lg`), cancelled safely → environment page: key names visible, **values in write-only password inputs**, colored diff badges in history (`head`, `− REDIS_URL`, `+ DATABASE_URL`…). Checks: **no plaintext secret in the DOM**, **zero console errors (no CSP violations)**, CSP header intact.

## Files touched

Created: `docs/decisions/adr-010-ui-component-strategy.md`, `src/components/ui/*` (13 files), `src/components/{Providers,Logo,AppShell}.tsx`, `plannings/11`, this worklog.
Rewrote: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/login`, `app/signup`, `app/vaults` (+`[vaultId]` + `env/[envId]`), `app/devices`, `src/components/{UnlockGate,MembersPanel,FilesPanel,ServiceAccountsPanel,SecretsEditor}.tsx`. Updated AGENTS map, docs INDEX.

## Verification totals

98 tests green; tsc/lint/`next build` clean; **package.json unchanged this turn** (zero new deps). SecretsEditor commit/rebase/import logic preserved verbatim — only presentation changed.

## Follow-up fix (same day)

- **Secrets editor row layout was broken** (value inputs collapsed to tiny boxes with a large gap): the `Input` base `w-full` conflicted with the row's `w-64`/`flex-1` on the same element (Tailwind can't deterministically merge conflicting widths). Fixed by wrapping each cell in a sizing `div` (`w-64 shrink-0`, `min-w-0 flex-1`) and letting the `Input` fill it via `w-full`. Verified live: value input spans the row (~526px), visible border + surface-0 bg, no console errors. Same pattern applied to the "add secret" form row.

## Follow-ups

- If faster iteration is ever wanted, DaisyUI (CSS-only, CSP-safe) could layer in without runtime JS — noted in ADR-010.
- Mobile nav is functional but minimal; a hamburger menu could come later.
