# Auth Form UX + Prod CSP Fix · Worklog · 2026-07-23

**Triggers:** (1) signup button UX; (2) production signup/login "not working" with CSP errors in console and `login?email=…&password=…` in the URL.

## The real production bug (most important)

Console on prod showed Next.js scripts blocked by CSP ("Executing inline script violates … a nonce is required") and the form submitting as a **native GET with credentials in the URL** (`/login?email=…&password=…`).

**Root cause:** the nonce-based CSP (`proxy.ts`) generates a fresh nonce per request, but login/signup/landing were **statically prerendered** — their script-tag nonces are baked at build time and never match the runtime CSP nonce. So on prod every script is blocked → React never hydrates → the `onSubmit` handler (which calls `preventDefault` + fetch) never attaches → the browser does a native GET form submit, leaking credentials into the URL. Works in dev because dev always renders dynamically.

**Fix:** `export const dynamic = "force-dynamic"` in `app/layout.tsx` so Next renders every page per-request and stamps the live nonce onto the scripts. Verified on a **production build** (`next build && next start`): within one response the CSP-header nonce equals the script-tag nonces; browser shows **no CSP violations**, the page hydrates, login submits via fetch and routes to `/vaults`, and **no credentials appear in the URL**.

**Defense-in-depth:** forms now use `method="post"` so that even if JS ever fails, a native submit posts credentials in the body (405), never in the URL/query/history.

## Button behavior (reverted per request)

The button is **disabled until the form is actually valid** again (user asked for this; the earlier always-enabled version was wrong). Validity gating is **autofill-proof**: inputs are uncontrolled, and a `recompute()` reads live DOM values on `onInput`/`onChange`, on `onAnimationStart` (a no-op `ev-autofill` keyframe on `:-webkit-autofill` fires when Chrome autofills), and once on mount (pre-hydration autofill). So the button enables correctly whether the user types or autofills. Signup requires: valid email, password ≥10, matching confirm, acknowledged. Verified: disabled empty → enabled after valid input.

## Errors (kept)

`humanizeApiError(error, context)` maps API codes → human-readable messages + a dev-friendly `status · code` detail line; `email_taken` shows on the email field, others in a banner. Autofilled-then-server-rejected shows the specific message.

## Verification

- Production build: nonce match confirmed; browser E2E login works with zero CSP violations and no creds-in-URL.
- tsc/lint clean; `next build` all routes now `ƒ` (dynamic).

## Follow-up: prod API still 500s (DB or libsodium)

After the CSP fix, deployed `/api/auth/*` still 500 (kdf, login, signup) — a DB-or-crypto failure. Every failing endpoint does `getUserByEmail` (DB) then libsodium; couldn't isolate remotely because the error text wasn't logged. Two changes to address it:

1. **`serverExternalPackages: ["libsodium-wrappers-sumo"]`** in `next.config.ts` — the likely fix if the cause is wasm init breaking when bundled into the serverless function (a known Vercel/Next failure). Verified locally in prod mode: login→401, kdf→200 (DB + crypto both fine with libsodium external).
2. **`withRoute` now logs the error name+message on 5xx** (`… -> 500 — Error: <cause>`) — still no bodies/payloads, but 5xx are now diagnosable in Vercel logs.

## Still required for the DEPLOYED app to work

1. **Redeploy** with `force-dynamic` (CSP/hydration) + `serverExternalPackages` (libsodium) + the logging change.
2. **Set `DATABASE_URL` + `SERVER_SECRET`** in Vercel env vars if not already (Neon DB itself is healthy; verified 8 users).
3. If it still 500s after redeploy, the Vercel function log now shows the exact cause (`… -> 500 — <error>`) — paste it and I'll fix the specific issue (DB SSL/connection vs crypto).
