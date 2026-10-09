# Public voice demo and demo accounts

## What is public

`/try` lets anyone talk to an Orvia front desk with no account. It is only the
call: no dashboard, no calls list, no settings. Everything else needs sign-in
(`/_dashboard` redirects to `/login`). The visitor's business is built in the
browser from `NICHE_PRESETS`; nothing is stored or sent.

The only server call a visitor makes is `gemini-live-token`, which hands out a
single-use Gemini token. It is guarded three ways:

1. **Turnstile.** The page sends a Cloudflare Turnstile token; the function
   verifies it. Skipped only when `TURNSTILE_SECRET_KEY` is unset (local dev).
2. **Limits kept in Postgres** (`claim_demo_token`, migration 019), set in
   **Admin > Demo Data > Public demo limits**: calls per visitor per 10 minutes
   (default 6) and an optional daily cap across everyone (default: no cap; 0
   pauses the demo). The old in-memory counter reset on every cold start.
3. **Short tokens.** 4 minutes for visitors (the page ends the call at 3);
   signed-in users keep 15.

## Setup

1. Create a Turnstile widget in Cloudflare (managed or invisible).
2. Web env: `VITE_TURNSTILE_SITE_KEY=<site key>`.
3. Edge function secrets: `TURNSTILE_SECRET_KEY`, optionally
   `ALLOWED_ORIGINS` (comma separated, e.g. `https://app.example.com`).
4. Apply `supabase/migrations/019_public_demo_and_demo_accounts.sql`, then
   deploy `gemini-live-token`. Deploy in that order: the function needs
   `claim_demo_token`.

Without the migration the function answers 503 to visitors ("The demo is
unavailable right now") and signed-in users are unaffected.

## Demo accounts for prospects

Create the login the way you do today (Supabase Auth plus a `users` row), then
open **Admin > Users** and use **Change...** in the Access column: demo for 7,
14 or 30 days, or full access.

- A demo shows a banner ("Demo access ends in N days").
- `expire_demo_accounts()` runs every 15 minutes (pg_cron) and bans logins whose
  date has passed. The browser also signs out an expired demo at once.
- Extending a demo, or choosing full access, lifts the ban.
- Admin accounts and your own account cannot be limited.
