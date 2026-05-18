# Orvia Platform Architecture

**Analysis Date:** 2026-05-18

---

## TL;DR

This codebase is **two partially-built apps living in the same repo** — a Next.js app that was started first and never fully deleted, and a Vite + React + TanStack Router app that is the current working implementation. The live app is the Vite one. The Next.js code is dead but still present and will confuse any future development if not removed. There is also a critical missing piece: the Vapi `assistant-request` webhook handler (which was written for Next.js) has no equivalent in the Vite app, meaning it cannot be deployed to Vercel as-is.

---

## 1. Runtime Architecture

```
Browser (SPA)
  └── Vite + React 19 (dist/ deployed as static on Vercel)
        ├── TanStack Router (file-based routing, src/routes/)
        ├── TanStack Query (server state, cache, mutations)
        ├── AuthProvider (src/lib/auth.tsx)
        └── Supabase JS client (src/lib/supabase.ts)
              └── Supabase (hosted: drtifnpjpnjomhqljwrl)
                    ├── auth.users (Supabase Auth)
                    ├── clinics (tenants)
                    ├── users (dashboard logins)
                    ├── calls (AI call records)
                    ├── leads (captured inquiries)
                    └── appointments (booked slots)

Vapi (telephony + AI)
  └── Phone call received → assistant-request webhook → buildAssistantConfig
        └── AI tools call n8n webhooks mid-call:
              ├── capture-lead
              ├── check-availability
              └── book-appointment
        └── Call ends → vapi-events → updates calls table

n8n (Railway: primary-production-3207.up.railway.app)
  ├── Workflow: call-started (creates calls row)
  ├── Workflow: capture-lead (creates leads row)
  ├── Workflow: check-availability (returns mock slots — no real calendar)
  ├── Workflow: book-appointment (creates appointments row)
  └── Workflow: vapi-events (updates call with transcript/summary on end)
```

---

## 2. The Two-App Problem (Critical)

### The Vite app (LIVE - what actually runs)

Entry point: `src/main.tsx`
Router: TanStack Router with file-based routes in `src/routes/`
Build config: `vite.config.ts` → outputs to `dist/`
Deploy config: `vercel.json` → `npx vite build`, serves `index.html` for all routes (SPA mode)

This is the real app. All active page components live in `src/components/pages/`. Data fetching uses `src/lib/api.ts` via TanStack Query.

### The Next.js app (DEAD - should be deleted)

These files exist but are never executed in the deployed app:

| File | What it is | Problem |
|------|-----------|---------|
| `src/app/layout.tsx` | Next.js root layout | Uses `next/font/google`, never loaded |
| `src/app/(auth)/layout.tsx` | Next.js auth group layout | Dead |
| `src/app/(auth)/login/page.tsx` | Next.js login page | Dead |
| `src/app/(dashboard)/layout.tsx` | Next.js dashboard layout | Imports `@/lib/supabase/client` — **broken import** |
| `src/app/(dashboard)/page.tsx` | Next.js overview page | Imports from `next/link`, `@/lib/queries` — dead but confusing |
| `src/app/(dashboard)/calls/page.tsx` | Next.js calls list | Dead |
| `src/app/(dashboard)/calls/[id]/page.tsx` | Next.js call detail | Dead |
| `src/app/(dashboard)/leads/page.tsx` | Next.js leads page | Dead |
| `src/app/(dashboard)/settings/page.tsx` | Next.js settings page | Dead |
| `src/app/api/vapi/assistant-request/route.ts` | **Vapi webhook handler** | Next.js API route — **NOT DEPLOYED in Vite build** |
| `src/components/dashboard/orvia-sidebar.tsx` | Next.js sidebar | Imports `@/lib/supabase/client` — **broken import** |
| `src/components/dashboard/orvia-header.tsx` | Next.js header | Imports `next/navigation` — not used by Vite routes |
| `src/components/dashboard/mark-handled-button.tsx` | Next.js button | Imports `@/lib/supabase/client` — **broken import** |
| `src/components/dashboard/call-detail-view.tsx` | Next.js call view | Not used by Vite routes |
| `src/components/dashboard/call-list-table.tsx` | Not used anywhere | Imports `next/navigation` |
| `src/components/dashboard/lead-list-table.tsx` | Not used anywhere | Imports `next/navigation` |
| `src/components/dashboard/nav-items.ts` | Nav config | Only used by dead orvia-sidebar.tsx |
| `src/components/dashboard/weekly-chart.tsx` | Chart component | Not used by Vite pages |
| `src/components/dashboard/outcome-chart.tsx` | Chart component | Not used by Vite pages |
| `src/components/dashboard/settings-tabs.tsx` | Settings UI | Not used by Vite pages |
| `src/components/dashboard/stat-card.tsx` | Stat card | Not used by Vite pages |
| `src/components/dashboard/transcript-view.tsx` | Transcript | Only used by dead call-detail-view.tsx |
| `next.config.ts` | Next.js config | Dead |
| `src/app/globals.css` | CSS file | **Actually imported** by `src/main.tsx` — this one is fine |

Additional leftover Next.js artifacts in `package.json`: `next: 16.2.0`, `eslint-config-next: 16.2.0`, `@supabase/ssr`.

### Broken imports (will cause build errors if referenced)

- `@/lib/supabase/client` — does not exist. The working client is `@/lib/supabase.ts` (a named export `supabase`).
- `next/link`, `next/navigation`, `next/font/google`, `next/server` — Next.js-only, not available in a Vite build.

---

## 3. lib/api.ts vs lib/queries.ts — The Duplication

Both files exist, both import from `@/lib/supabase`, both export nearly identical functions.

**`src/lib/queries.ts`** — used by the **dead Next.js pages** only:
- `getOverviewStats`, `getRecentCalls`, `getCalls`, `getCallById`, `getLeadByCallId`, `getAppointmentByCallId`, `getWeeklyCallStats`, `getOutcomeBreakdown`, `getLeads`, `getClinicSettings`, `getUserClinicId`
- Missing: `getBriefing`, `markCallHandled`, `markLeadContacted`, `markLeadBooked`, `updateClinicSettings`, `updateClinicTopLevel`
- No pagination on `getWeeklyCallStats` (sequential loop, not parallelized — 21 serial queries)

**`src/lib/api.ts`** — used by the **live Vite pages** only:
- All of the above plus `getBriefing`, `markCallHandled`, `markLeadContacted`, `markLeadBooked`, `updateClinicSettings`, `updateClinicTopLevel`
- `getWeeklyCallStats` here is parallelized (Promise.all for all 7 days concurrently — 7 batches of 3)
- Has the `getBriefing` function used by the overview page (6 parallel queries for today's data)

**Verdict:** `src/lib/queries.ts` is dead code. The live app exclusively uses `src/lib/api.ts`. The test in `src/lib/__tests__/queries.test.ts` imports from `queries` (not `api`) — those tests test dead code.

---

## 4. Data Flow: Supabase to UI

### Authentication flow

```
src/main.tsx
  └── <AuthProvider> (src/lib/auth.tsx)
        ├── supabase.auth.getSession() on mount
        ├── supabase.auth.onAuthStateChange() subscription
        ├── fetchUserData() → supabase.from("users").select("clinic_id, full_name, role")
        └── exposes: user, session, clinicId, profile, signIn(), signOut(), updateProfile()

src/routes/_auth.tsx        — if auth.user exists → redirect "/"
src/routes/_dashboard.tsx   — if !auth.user → redirect "/login"
  └── passes context { auth, queryClient } via router context
```

### Data fetch flow (standard page)

```
Route file (e.g., src/routes/_dashboard/calls.tsx)
  └── renders page component (src/components/pages/calls.tsx)
        └── useQuery({ queryKey: ["calls", page], queryFn: () => getCalls(page, pageSize) })
              └── getCalls() in src/lib/api.ts
                    └── supabase.from("calls").select("*")...
                          └── Supabase RLS → only rows where clinic_id matches user's clinic
```

### Mutation flow

```
src/components/pages/call-detail.tsx
  └── useMutation({ mutationFn: () => markCallHandled(id) })
        └── markCallHandled() in src/lib/api.ts
              └── supabase.from("calls").update({ status: "completed" }).eq("id", callId)
        └── onSuccess: queryClient.invalidateQueries(["call", id]) + queryClient.invalidateQueries(["calls"])
```

### Vapi call flow (external, not through the dashboard)

```
Incoming phone call
  → Vapi receives call on registered phone number
  → Vapi POST to assistant-request webhook
      → src/app/api/vapi/assistant-request/route.ts (NEXT.JS — NOT DEPLOYED)
          → buildAssistantConfig() (src/lib/vapi/build-assistant-config.ts)
              → returns GPT-4o-mini config + 3 tool definitions pointing to n8n
  → AI conducts call, uses tools:
      → POST n8n/webhook/capture-lead → inserts into leads
      → POST n8n/webhook/check-availability → returns mock slots
      → POST n8n/webhook/book-appointment → inserts into appointments
  → Call ends → Vapi POST to n8n/webhook/vapi-events
      → n8n updates calls row (transcript, summary, recording_url, duration_secs, status=completed)
```

---

## 5. Route Structure (TanStack Router)

```
/ (root)
├── /_auth                   src/routes/_auth.tsx
│   └── /login               src/routes/_auth/login.tsx
│         component: LoginForm (src/components/auth/login-form.tsx)
│
└── /_dashboard              src/routes/_dashboard.tsx
    ├── /                    src/routes/_dashboard/index.tsx
    │     component: OverviewPage (src/components/pages/overview.tsx)
    ├── /calls               src/routes/_dashboard/calls.tsx
    │     component: CallsPage (src/components/pages/calls.tsx)
    ├── /calls/$id           src/routes/_dashboard/calls_.$id.tsx
    │     component: CallDetailPage (src/components/pages/call-detail.tsx)
    ├── /leads               src/routes/_dashboard/leads.tsx
    │     component: LeadsPage (src/components/pages/leads.tsx)
    └── /settings            src/routes/_dashboard/settings.tsx
          component: SettingsPage (src/components/pages/settings.tsx)
```

Route guards:
- `_auth.tsx` — `beforeLoad` redirects authenticated users to `/`
- `_dashboard.tsx` — `beforeLoad` redirects unauthenticated users to `/login`; also has `useEffect` guard for post-load auth state changes

---

## 6. Component Map

### Active components (used by Vite routes)

| File | Purpose | Data source |
|------|---------|-------------|
| `src/components/pages/overview.tsx` | Homepage: metrics, appointments, exception calls, mini chart | `getBriefing`, `getWeeklyCallStats` from `lib/api` |
| `src/components/pages/calls.tsx` | Paginated call list | `getCalls` from `lib/api` |
| `src/components/pages/call-detail.tsx` | Call detail with transcript, audio player, lead/appointment sidebar | `getCallById`, `getLeadByCallId`, `getAppointmentByCallId`, `markCallHandled` from `lib/api` |
| `src/components/pages/leads.tsx` | Paginated lead list with status filters | `getLeads` from `lib/api` |
| `src/components/pages/settings.tsx` | Clinic settings editor (4 tabs: Clinic Info, Services, AI Assistant, Account) | `getClinicSettings`, `updateClinicSettings`, `updateClinicTopLevel` from `lib/api` |
| `src/components/auth/login-form.tsx` | Email/password login form | `signIn()` from `lib/auth` |
| `src/components/dashboard/shell.tsx` | Dashboard layout: sidebar + topbar + content area | `useAuth` |

### Unused / dead components (in `src/components/dashboard/`)

These are all legacy from the Next.js build:

- `call-detail-view.tsx` — imported by dead `src/app/(dashboard)/calls/[id]/page.tsx`
- `call-list-table.tsx` — not imported by anything active
- `lead-list-table.tsx` — not imported by anything active
- `mark-handled-button.tsx` — imported by dead `call-detail-view.tsx` only, has broken import
- `nav-items.ts` — imported by dead `orvia-sidebar.tsx` only
- `orvia-header.tsx` — imported by dead `src/app/(dashboard)/layout.tsx` only
- `orvia-sidebar.tsx` — imported by dead `src/app/(dashboard)/layout.tsx` only, has broken import
- `outcome-chart.tsx` — imported by dead `src/app/(dashboard)/page.tsx` only
- `settings-tabs.tsx` — not imported by anything active
- `stat-card.tsx` — not imported by anything active
- `transcript-view.tsx` — imported by dead `call-detail-view.tsx` only
- `weekly-chart.tsx` — imported by dead `src/app/(dashboard)/page.tsx` only

### Unused shadcn/ui components (present but not imported in active code)

These were installed by shadcn but are not referenced by any active component:
- `src/components/app-sidebar.tsx` — shadcn scaffold, not used
- `src/components/chart-area-interactive.tsx` — shadcn scaffold, not used
- `src/components/data-table.tsx` — shadcn scaffold, not used
- `src/components/login-form.tsx` — shadcn scaffold, duplicate of `auth/login-form.tsx`, not used
- `src/components/nav-documents.tsx` — shadcn scaffold, not used
- `src/components/nav-main.tsx` — shadcn scaffold, not used
- `src/components/nav-secondary.tsx` — shadcn scaffold, not used
- `src/components/nav-user.tsx` — shadcn scaffold, not used
- `src/components/section-cards.tsx` — shadcn scaffold, not used
- `src/components/site-header.tsx` — shadcn scaffold, not used

---

## 7. Database Schema

Supabase project: `drtifnpjpnjomhqljwrl`

### Tables

**`clinics`** — multi-tenant root. One row per clinic.
- `id` UUID PK
- `name`, `slug` (unique), `phone_display`
- `vapi_phone_id` — used by `assistant-request` webhook to look up which clinic is calling
- `vapi_assistant_id` — stored but never read in current code (intended for static assigned assistants)
- `timezone` default `Asia/Kolkata`
- `settings` JSONB — all AI configuration (hours, services, FAQ, emergency protocols, etc.)
- `status` — `active | inactive | onboarding`

**`users`** — one per dashboard login, references `auth.users`
- `id` references `auth.users(id)` (same UUID)
- `clinic_id` links to clinics
- `role` — `owner | admin | staff` (only `owner` used in practice)

**`calls`** — one row per Vapi call
- `vapi_call_id` unique — the Vapi-assigned ID, used to correlate n8n events
- `transcript` JSONB — array of `{ role, content, timestamp }`
- `extracted_data` JSONB — structured data the AI pulled from the conversation
- `outcome` — `appointment_booked | lead_captured | info_given | transferred | missed`
- `status` — `in_progress | completed | missed | failed | transferred`

**`leads`** — captured patient inquiries
- `call_id` nullable FK — link back to the call that created the lead
- `urgency` — `emergency | urgent | routine | inquiry`
- `status` — `new | contacted | booked | closed | lost`

**`appointments`** — confirmed bookings
- `call_id` nullable FK — link back to the call
- `lead_id` nullable FK — link to associated lead
- `google_cal_event_id` — stored but never populated in current code (GCal not yet integrated)

### Row Level Security

All 5 tables have RLS enabled. Policy pattern: users can only access rows where `clinic_id` matches their own clinic:

```sql
-- Example (applies to calls, leads, appointments):
clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
```

The `users` table policy: `id = auth.uid()` (users only see their own row).

Note: RLS uses the **anon key** (browser client). The n8n workflows use the **service role key** to bypass RLS, which is correct but means n8n has full write access with no row-level filtering.

### Indexes

```sql
idx_calls_clinic_created    ON calls(clinic_id, created_at DESC)
idx_calls_vapi_id           ON calls(vapi_call_id)
idx_leads_clinic_created    ON leads(clinic_id, created_at DESC)
idx_leads_clinic_status     ON leads(clinic_id, status)
idx_appointments_clinic_start ON appointments(clinic_id, scheduled_start)
idx_users_clinic            ON users(clinic_id)
```

### Realtime

`calls` table is published to `supabase_realtime`. The dashboard does not currently subscribe to realtime — overview page uses `refetchInterval: 30_000` polling instead.

---

## 8. Supabase Directory

```
supabase/
├── config.toml                  — linked to project drtifnpjpnjomhqljwrl
├── migrations/
│   └── 001_initial_schema.sql   — full schema, RLS, indexes, realtime
├── apply-to-supabase.sql        — alternative: DROP+CREATE+seed for direct SQL editor use
│                                  (includes demo clinic: sharma-dental)
└── seed_home_services.sql       — alternative seed for home services demo (swift-home-services)
```

There is one migration file. The migration and the `apply-to-supabase.sql` define the same schema — the SQL file is more convenient for manual resets, the migration is for `supabase db push`.

No edge functions exist in the `supabase/` directory.

---

## 9. n8n Workflow Layer

Defined in `scripts/create-n8n-workflows.mjs`. Deployed to Railway at `primary-production-3207.up.railway.app`.

| Workflow | Webhook path | Trigger | What it does |
|---------|-------------|---------|-------------|
| Call Started | `/webhook/call-started` | Vapi `call.started` event | Looks up clinic by `vapi_phone_id`, inserts `calls` row with `status=in_progress` |
| Capture Lead | `/webhook/capture-lead` | AI calls `capture_lead` tool | Looks up call by `vapi_call_id`, inserts `leads` row |
| Check Availability | `/webhook/check-availability` | AI calls `check_availability` tool | Returns randomly filtered hardcoded time slots — **no real calendar integration** |
| Book Appointment | `/webhook/book-appointment` | AI calls `book_appointment` tool | Looks up call, inserts `appointments` row |
| Call Ended / Vapi Events | `/webhook/vapi-events` | Vapi `end-of-call-report` or `status-update(ended)` | Updates `calls` row with transcript, summary, recording_url, duration_secs, cost_cents |

All workflows authenticate to Supabase using the service role key (bypasses RLS). The workflows contain the hardcoded Supabase URL `odefnvrtbklydspokdmc.supabase.co` — note this differs from the config.toml project ID `drtifnpjpnjomhqljwrl`. This is a discrepancy worth verifying.

### What's missing in n8n

- No `outcome` field is set on calls when the call ends. The `vapi-events` workflow updates `status=completed` but never sets `outcome`. Outcome data would need to come from Vapi's end-of-call-report analysis or be set separately.
- No `extracted_data` is populated from the call. Patient name, service requested, etc. are captured in leads/appointments but not back-filled to `calls.extracted_data`.
- `check-availability` is a stub returning random mock slots. Real Google Calendar integration requires a service account and is not implemented.

---

## 10. Vapi Integration

### assistant-request webhook (the missing piece)

The `assistant-request` handler at `src/app/api/vapi/assistant-request/route.ts` is a Next.js API route. In the current Vite deployment this endpoint **does not exist**. Vapi cannot dynamically configure the AI assistant for each clinic.

For this to work in production, one of the following is needed:
1. **Supabase Edge Function** at `supabase/functions/assistant-request/index.ts` that implements the same logic
2. **n8n webhook** (6th workflow) that handles the `assistant-request` event
3. **Vercel Serverless Function** (would require converting the build to Next.js or adding a Vercel function to the Vite build)

Currently, Vapi must be using a static pre-configured assistant (not the dynamic per-clinic config). The `buildAssistantConfig` function in `src/lib/vapi/build-assistant-config.ts` is correct and complete — it just has no live entrypoint.

### AI assistant config (`src/lib/vapi/build-assistant-config.ts`)

- Model: GPT-4o-mini (OpenAI), temperature 0.3
- Voice: ElevenLabs "rachel" (English only — Hindi voice not configured despite `language_preference` field)
- Max call duration: 5 minutes
- Silence timeout: 15 seconds
- 3 function tools: `capture_lead`, `check_availability`, `book_appointment`
- 1 transfer tool: enabled only when `settings.transfer_number` or `settings.emergency_number` is set
- `serverUrl` points to n8n `vapi-events` webhook for call lifecycle events

---

## 11. Scripts

| File | Purpose |
|------|---------|
| `scripts/create-n8n-workflows.mjs` | Creates and activates all 5 n8n workflows via n8n API. Deletes existing workflows first. Requires `N8N_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. |
| `scripts/seed-dev-data.mjs` | Seeds a demo dental clinic + auth user + 8 calls + 3 leads + 1 appointment into Supabase. Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Uses legacy env var name. |

The seed script uses `NEXT_PUBLIC_SUPABASE_URL` — in the Vite app the correct env var is `VITE_SUPABASE_URL`. This script won't work unless the env var is renamed or aliased.

---

## 12. Testing

Framework: Vitest. Config: `vitest.config.ts`, environment: `node`.

| Test file | Tests | Status |
|-----------|-------|--------|
| `tests/lib/vapi/build-assistant-config.test.ts` | 5 tests for `buildAssistantConfig()` | Active, tests live code |
| `src/lib/__tests__/queries.test.ts` | 4 smoke tests checking exports exist | Tests `lib/queries` (dead code) |
| `src/components/auth/__tests__/login-form.test.tsx` | 1 smoke test checking export exists | Active |

All tests are shallow (no DOM rendering, no Supabase mocking). The `build-assistant-config` tests are the most meaningful — they verify tool structure, webhook URLs, and system prompt content.

---

## 13. What's Missing for Production

### Critical

1. **Vapi `assistant-request` endpoint** — no handler exists in the Vite/Vercel deployment. Without it, Vapi cannot dynamically configure the AI for each clinic. Must be implemented as a Supabase Edge Function or equivalent.

2. **`call-ended` outcome population** — the n8n vapi-events workflow sets `status=completed` but never sets `outcome` (appointment_booked, lead_captured, etc.). The dashboard outcome charts and filters will show empty/null for all real calls. Outcome needs to be extracted from Vapi's end-of-call-report payload.

3. **Real availability checking** — `check-availability` returns random slots. If a patient picks a slot, there is no guarantee the clinic hasn't already booked it. Google Calendar integration is required.

4. **Multi-tenant data isolation** — all dashboard queries run without a `clinic_id` filter (e.g., `supabase.from("calls").select("*")`). Data isolation relies entirely on RLS. If RLS is ever misconfigured or bypassed, clinics would see each other's data.

### Important gaps

5. **No call-end webhook handler in-repo** — the `vapi-events` workflow is defined in a JS script for n8n but there is no serverless or edge function version. If n8n goes down, calls stop being recorded.

6. **`extracted_data` never populated** — the `calls.extracted_data` JSONB column is defined in the schema and referenced in the UI (call detail page renders it), but nothing in n8n populates it. It will always be `{}`.

7. **Hindi/bilingual support stubbed** — `language_preference` field exists in settings and `language_detected` field exists on calls, but the AI voice is hardcoded to `rachel` (English ElevenLabs voice). No Hindi voice configured.

8. **Google Calendar event IDs stored but never written** — `appointments.google_cal_event_id` is always null. The seed data and settings reference `calendar_provider: "google"` but no integration exists.

9. **No Supabase Realtime subscription** — `calls` is published to realtime but the dashboard polls every 30 seconds instead of subscribing. This is a UX tradeoff, not a bug.

10. **Auth has no refresh token handling failure path** — if `supabase.auth.getSession()` fails, `isLoading` stays true forever. The app would show the spinner indefinitely.

---

## 14. Environment Variables

**Vite app (browser):**
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — public anon key

**Next.js API route / n8n / scripts (server):**
- `NEXT_PUBLIC_SUPABASE_URL` — used by legacy seed script (should be `VITE_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key, used by n8n workflows and scripts
- `N8N_BASE_URL` — used by `buildAssistantConfig` to point Vapi tools at n8n
- `N8N_WEBHOOK_SECRET` — shared secret for Vapi tool requests to n8n
- `N8N_API_KEY` — used by `create-n8n-workflows.mjs` script only

`.env.local.example` exists. `.env.local` exists and is gitignored.

---

## 15. File Structure Summary

```
scalyft-orvia/
├── src/
│   ├── main.tsx                     ENTRY POINT (Vite app)
│   ├── routeTree.gen.ts             Auto-generated by TanStack Router plugin
│   ├── vite-env.d.ts                Vite env type declarations
│   ├── routes/                      LIVE ROUTES (TanStack Router)
│   │   ├── __root.tsx               Root route with RouterContext type
│   │   ├── _auth.tsx                Auth layout (redirect if logged in)
│   │   ├── _auth/login.tsx          Login route
│   │   ├── _dashboard.tsx           Dashboard layout (redirect if not logged in)
│   │   ├── _dashboard/index.tsx     / → OverviewPage
│   │   ├── _dashboard/calls.tsx     /calls → CallsPage
│   │   ├── _dashboard/calls_.$id.tsx /calls/:id → CallDetailPage
│   │   ├── _dashboard/leads.tsx     /leads → LeadsPage
│   │   └── _dashboard/settings.tsx  /settings → SettingsPage
│   ├── components/
│   │   ├── pages/                   LIVE PAGE COMPONENTS (used by Vite routes)
│   │   │   ├── overview.tsx
│   │   │   ├── calls.tsx
│   │   │   ├── call-detail.tsx
│   │   │   ├── leads.tsx
│   │   │   └── settings.tsx
│   │   ├── auth/                    LIVE
│   │   │   ├── login-form.tsx
│   │   │   └── __tests__/login-form.test.tsx
│   │   ├── dashboard/               MIXED — some live, most dead
│   │   │   └── shell.tsx            LIVE — dashboard layout wrapper
│   │   │   (all others are Next.js era — see section 2)
│   │   └── ui/                      shadcn/ui primitives (partially used)
│   ├── lib/
│   │   ├── supabase.ts              Supabase browser client (singleton)
│   │   ├── auth.tsx                 AuthContext + AuthProvider
│   │   ├── types.ts                 TypeScript interfaces (Clinic, Call, Lead, etc.)
│   │   ├── api.ts                   DATA LAYER — all active queries + mutations
│   │   ├── queries.ts               DEAD — duplicate of api.ts, used only by Next.js pages
│   │   ├── utils.ts                 cn() utility only
│   │   ├── vapi/
│   │   │   └── build-assistant-config.ts  Builds Vapi assistant config from clinic data
│   │   └── __tests__/queries.test.ts  Tests dead code
│   ├── hooks/
│   │   └── use-mobile.ts            Not actively used
│   └── app/                         DEAD — Next.js app directory (entire subtree)
│       ├── layout.tsx
│       ├── globals.css              (imported by main.tsx — this one is kept)
│       ├── favicon.ico
│       ├── (auth)/...
│       ├── (dashboard)/...
│       └── api/vapi/assistant-request/route.ts  CRITICAL MISSING PIECE
├── supabase/
│   ├── config.toml                  Linked project config
│   ├── migrations/001_initial_schema.sql
│   ├── apply-to-supabase.sql        Manual apply script + dental clinic seed
│   └── seed_home_services.sql       Home services demo seed
├── scripts/
│   ├── create-n8n-workflows.mjs     Creates all 5 n8n workflows via API
│   └── seed-dev-data.mjs            Seeds demo data (uses legacy NEXT_PUBLIC_ env)
├── tests/
│   └── lib/vapi/build-assistant-config.test.ts  ACTIVE TESTS
├── config/
│   └── clinic-onboarding-template.json
├── system prompt/
│   ├── SYSTEM PROMPT.md             Vapi AI system prompt reference doc
│   └── VAPI TOOLS.txt               Vapi tools reference
├── vite.config.ts                   Vite build config (@ alias → src/)
├── vitest.config.ts                 Test config
├── vercel.json                      Deploy: npx vite build, SPA rewrites
├── next.config.ts                   DEAD — should be deleted
├── package.json                     Has both next and vite as dependencies
├── tsconfig.json
├── components.json                  shadcn/ui config
└── index.html                       Vite entry HTML
```

---

## 16. Rebuild Priorities

Based on this analysis, the rebuild should address these in order:

1. **Delete the entire `src/app/` directory** (except `globals.css` which gets moved to `src/`) and all dead `src/components/dashboard/` components. Remove `next`, `@supabase/ssr`, `eslint-config-next` from `package.json`. Remove `next.config.ts`.

2. **Implement Vapi `assistant-request` as a Supabase Edge Function** at `supabase/functions/assistant-request/index.ts`. Port the logic from `src/app/api/vapi/assistant-request/route.ts` — it's clean and correct, just needs a Deno-compatible wrapper.

3. **Implement outcome detection in n8n `vapi-events` workflow** — extract outcome from the end-of-call summary or from tool call history in the Vapi payload.

4. **Replace stub `check-availability` with real calendar integration** — either Google Calendar API or a simple availability model based on existing appointments in Supabase.

5. **Rename `NEXT_PUBLIC_SUPABASE_URL` to `VITE_SUPABASE_URL` in `scripts/seed-dev-data.mjs`.**

6. **Migrate `lib/queries.ts` tests to test `lib/api.ts`** — the existing tests are testing dead code.
