# ADR-010 — UI: custom in-repo component kit, no third-party UI runtime

**Status:** Accepted (UI restructure) · **Date:** 2026-07-23

## Context

The UI needed a structural overhaul (app shell, consistent components, proper dialogs). Candidates: shadcn/Radix (headless JS primitives), daisyUI (CSS-only plugin), or a custom kit on Tailwind 4. Constraint: threat-model T8 makes the browser the most sensitive surface, and Phase H's dependency review kept client-shipped third-party code to libsodium + framework only.

## Decision

**Custom in-repo component kit** (`src/components/ui/`) on Tailwind 4 design tokens — Button, Input/Select, Card, Badge, Alert, Modal/ConfirmButton, Spinner, EmptyState, Fingerprint. Modals use the native `<dialog>` element (focus trapping, ESC, backdrop for free — no JS dependency). Zero new runtime dependencies; every rendered line is repo-reviewed code.

## Consequences

- The Phase H dependency conclusions remain valid unchanged; CSP untouched.
- We own a11y details Radix would have provided (dialog semantics come from the platform; menus/comboboxes stay simple or are avoided).
- Restyle-only rule for security-relevant surfaces: write-only value inputs, fingerprint displays, honest-copy notices are preserved verbatim in the new components.

## Alternatives rejected

- **shadcn/Radix:** excellent, but adds headless-JS packages to p