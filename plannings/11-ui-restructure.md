# 11 — UI Restructure

**Status: DONE (2026-07-23)** — see [worklog/ui-restructure__worklog_2026-07-23.md](../worklog/ui-restructure__worklog_2026-07-23.md)

**Goal:** replace the functional-but-plain UI with a cohesive design system and restructured pages, without weakening the security posture ([ADR-010](../docs/decisions/adr-010-ui-component-strategy.md): custom kit, zero new runtime deps). Behavior/flows unchanged — presentation + structure only.

**Dependencies:** Phase 2. **Blocks:** nothing.

## Steps

### U1. Design system
- [x] Tokens in `globals.css` via Tailwind v4 `@theme`: surface layers (bg/0/1/2), borders, emerald accent, semantic danger/warn/info, radii, shadow. Dark-first. Base styles: focus ring, selection, scrollbars, keyframes.

### U2. Component kit (`src/components/ui/`, zero new deps)
- [x] Primitives: `Button` (4 variants/3 sizes/loading), `Input`/`Textarea`, `Field`/`Label`, `Card`/`CardHeader`/`CardBody`, `Badge` (5 tones), `Spinner`, `EmptyState`.
- [x] `Dialog` (portal + focus trap + Esc/overlay close + scroll lock) and `useConfirm` (confirm + prompt) replacing all native dialogs.
- [x] `ToastProvider`/`useToast` for transient feedback; `CopyField` for one-time secrets.

### U3. App shell
- [x] `AppShell` sticky top nav (wordmark, Vaults/Devices, email, sign out) + `PageHeader` with back-link/action slots. `Providers` wraps toast + confirm at the root layout.

### U4. Page redesigns (same data/flows)
- [x] Landing, `/login`, `/signup` (kept no-recovery acknowledgement), `/vaults` (card grid + invitations), `/vaults/[id]` (sectioned cards), `/vaults/[id]/env/[id]` (refined editor + history/compare/restore), `/devices`, `UnlockGate`.

### U5. Verify
- [x] All 8 native `confirm/prompt/alert` sites replaced by dialogs (grep-clean).
- [x] Browser walkthrough: shell, vault cards, **modal dialog** (delete confirm, role=dialog), secrets editor with concealed values, colored diff badges. **No plaintext in DOM; zero console errors (no CSP violations).**
- [x] tsc/lint/`next build` clean; 98 tests green.

## Exit criteria

- [x] All pages use the shell + kit; no native dialogs remain.
- [x] Zero new runtime dependencies (package.json unchanged this turn — ADR-010 honored).
- [x] Suite green; build clean; browser-verified; worklog written.

## Note (Tailwind v4)

Initial pass used `bg-[--color-x]` arbitrary classes, which v4 does NOT resolve to `var(--color-x)` (buttons rendered transparent). Fixed by converting to the theme utilities that `@theme` generates (`bg-accent`, `border-border`, `rounded-lg`, `shadow-pop`) — also correct for opacity modifiers (`border-danger/40`). Verified via computed styles: accent `#10b981`, radii from tokens.
