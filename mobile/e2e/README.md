# Local backend for end-to-end testing

Runs the real Orvia migrations on real Postgres, behind a real PostgREST, with
the real `vapi-events` edge function. A small gateway stands in for Supabase
Auth and Realtime. No Docker and no Supabase project needed, and nothing
touches the live database.

```
app ──► gateway :54321 ──► /rest/v1       PostgREST :54331 ──► Postgres :54322
                       ├─► /functions/v1  vapi-events in Deno :54341
                       ├─► /auth/v1       password sign-in, refresh, change password
                       ├─► /realtime/v1   NOTIFY ──► postgres_changes
                       └─► /__e2e/*       test helpers
```

Test infrastructure only. It binds to 127.0.0.1 and has no real security.

## One-time setup

The tools live outside the repo, in `../../../.e2e-tools` (override with
`ORVIA_E2E_TOOLS`):

| Folder | What |
| --- | --- |
| `pg/pgsql/bin` | PostgreSQL 16 binaries (the EDB zip) |
| `postgrest/artifacts/postgrest-windows-x64/postgrest.exe` | PostgREST |
| `deno/deno.exe` | Deno |

`pgdata` is created on the first run.

```bash
cd mobile/e2e
npm install
```

## Run

```bash
node harness.mjs
```

It applies migrations 001 onward (pg_cron calls stripped), seeds the users and
data in `seed.sql`, starts everything and writes `.generated/env.json`. Ctrl+C
stops it.

| User | Password | For |
| --- | --- | --- |
| owner@smile.test | Correct-horse-1 | The main owner, with calls, bookings and follow-ups |
| temp@smile.test | Temp-pass-123 | Must choose a new password on first sign-in |
| orphan@x.test | Orphan-pass-123 | Signed in but not linked to a business |
| owner@rival.test | Rival-pass-123 | A second business, to prove data stays separate |

## Point the app at it

The generated config points at `127.0.0.1:54321`. Forward that port from the
phone or emulator to this computer:

```bash
adb reverse tcp:54321 tcp:54321
```

then build with the generated config. It sets `ALLOW_INSECURE_LOCAL` (plain
http to loopback, debug builds only) and `E2E_NO_APP_LOCK` (skips the
fingerprint prompt, ignored in release):

```bash
cd mobile
flutter run --flavor dev --dart-define-from-file=e2e/.generated/env.json
```

## Helpers

| Request | Does |
| --- | --- |
| `POST /__e2e/reseed` | Puts the seed data back |
| `GET /__e2e/state` | Password-reset emails the gateway "sent" |
| `POST /__e2e/query` `{ "sql": "...", "params": [] }` | Runs SQL as the superuser |
| `POST /__e2e/vapi` | Simulates a whole call through the real `vapi-events` function |

`/__e2e/vapi` takes optional `caller`, `summary`, `transcript`,
`durationSeconds`, `waitMs` and `kind` (`"missed"` or `"start-only"`). With
no body it is a finished booking call to Smile Dental: the app should update
Home and show a notification.

## Tests

```bash
npm test
```

checks the gateway's own token and password handling.
