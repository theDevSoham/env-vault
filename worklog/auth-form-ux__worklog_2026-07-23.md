# Auth Form UX Fix · Worklog · 2026-07-23

**Trigger:** signup "Create account" button did nothing with fields filled; Google autofill not detected; errors were a single generic message.

## Root cause

- The button was `disabled={!acknowledged}` — dead with no feedback until the checkbox was ticked.
- Inputs were **controlled** (`value={state}`); browser/Google autofill often doesn't fire React's `onChange`, so state stayed empty while the fields looked filled → submit used empty values.
- Errors were one `useState<string>` shown in a single spot.

## Fix (signup + login)

- **Uncontrolled inputs read via `FormData` on submit** → autofill values are always captured (DOM is the source of truth). Inputs carry `name` + `autoComplete`.
- **Button only disabled while `busy`** — validation happens on submit and reports specifically, instead of a silently-disabled button.
- **Per-field + form-level errors**: `{email, password, confirm, acknowledge, form, formDetail}`; each rendered inline via `Field error=` / a danger banner. Errors clear on input.
- **`humanizeApiError(error, context)`** (new, in `src/lib/api/client.ts`): maps API codes to human-readable messages (`email_taken`, `unauthorized`, `invalid_body`, `rate_limited`, `internal`, network `TypeError`, 5xx) **plus a dev-friendly `status · code` detail line**. `email_taken` attaches to the email field; others show a banner.
- **Autofill styling**: `input:-webkit-autofill` override in globals.css so Chrome's yellow autofill background stays on-theme.

## Verification (browser, live)

- Empty submit → button clickable, shows all four specific field errors (no silent no-op).
- **Autofill simulation** — set input `.value`s via the native setter with **zero React events fired** (exactly what autofill does), submitted: values were captured, request reached the server, and the specific `email_taken` message rendered on the email field. (Old controlled code would have submitted empty.)
- Client validation: invalid email, short password ("Use at least 10 characters (you have 5)."), and password mismatch all show correct per-field messages.
- tsc/lint clean; `next build` ok; 98 tests green.

## Still pending (from prior turn, unrelated to this fix)

- Deployed Vercel API 500s on all DB calls — **`DATABASE_URL` + `SERVER_SECRET` not set in Vercel env vars** (Neon DB itself is healthy). CLI now defaults to the Vercel URL but can't be verified end-to-end until those are set and redeployed.
