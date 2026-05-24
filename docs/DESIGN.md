# Orvia - Technical Design Document

**Version:** 1.0
**Last Updated:** May 2026
**Status:** V1 - Live

---

## 1. What Orvia Is

A realtime AI operations layer for small home service businesses in the US. The AI answers every inbound call, qualifies the lead, books the job or captures the inquiry, and notifies the owner immediately. The owner watches it all from a web dashboard.

**ICP:** Solo to 5-person plumbing, HVAC, locksmith, or garage door operator. Missing 40-60% of inbound calls while on jobs. No receptionist.

**Beachhead vertical:** Plumbing first. 25 plumbing customers before expanding to HVAC.

---

## 2. System Architecture

```
INBOUND CALL
  │
  ▼  dials +13236182058 (Vapi phone number: 800adb67-...)
VAPI
  │  fires POST assistant-request webhook
  ▼
EDGE FN: assistant-request
  │  SELECT * FROM clinics WHERE vapi_phone_id = '800adb67-...'
  │  buildAssistantConfig(business, n8nBaseUrl, webhookSecret)
  ▼  returns { assistant: { model, voice, tools, systemPrompt } }
VAPI runs GPT-4o-mini with dynamic config
  │
  ├── tool: check_availability { date }
  │     ▼
  │   EDGE FN: check-availability?clinic_id=...
  │     reads appointments table → returns real free slots
  │
  ├── tool: capture_lead { name, service_needed, urgency }
  │     ▼
  │   N8N: /webhook/capture-lead
  │     INSERT INTO leads
  │
  └── tool: book_appointment { patient_name, phone, service_type, slot }
        ▼
      N8N: /webhook/book-appointment
        INSERT INTO appointments
  │
  ▼  call ends
N8N: /webhook/vapi-events
  │  UPDATE calls SET status, summary, transcript, recording_url, duration_secs, cost_cents, outcome
  ▼
SUPABASE DB (drtifnpjpnjomhqljwrl.supabase.co)

OWNER DASHBOARD
  ▼  browser → Vercel static SPA
  Vite + React 19 → reads Supabase directly via anon key + RLS
```

---

## 3. Infrastructure

| Service | Purpose | URL |
|---------|---------|-----|
| Vapi | Telephony + AI voice orchestration | `+13236182058` |
| Supabase | Postgres DB + Auth + Edge Functions | `drtifnpjpnjomhqljwrl.supabase.co` |
| n8n (Railway) | Webhook automation (lead/appointment writes, call events) | `primary-production-3207.up.railway.app` |
| Vercel | Static SPA hosting | `scalyft-orvia.vercel.app` |
| ElevenLabs | TTS voice (bundled via Vapi) | voice: `rachel` |
| OpenAI | LLM (via Vapi) | `gpt-4o-mini`, temp 0.3 |

---

## 4. Database Schema

### `clinics` - One row per business (multi-tenant root)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT | Business display name |
| `slug` | TEXT UNIQUE | URL-safe identifier |
| `phone_display` | TEXT | Human-readable phone |
| `vapi_phone_id` | TEXT | Vapi phone number ID - used to look up business on inbound call |
| `vapi_assistant_id` | TEXT | Stored but unused - dynamic config via assistant-request |
| `timezone` | TEXT | Default: `America/Chicago` for US home services |
| `settings` | JSONB | All AI config - see Settings Schema below |
| `status` | ENUM | `active \| inactive \| onboarding` |

### `settings` JSONB Structure

```typescript
{
  // Business identity
  receptionist_name?: string       // AI's name on calls (default: "Orvia")
  tagline?: string                 // Business motto
  address?: string
  landmark?: string
  city?: string

  // Hours
  hours?: string                   // Simple: "Mon-Sat 7am-7pm"
  operating_hours?: {              // Per-day: preferred over hours string
    monday: { open, close, lunch_break?, closed? }
    // ... all 7 days
  }

  // Services
  services?: string[]              // Simple list fallback
  service_details?: [{             // Full detail - used for AI context
    name, description, price_range, duration_minutes,
    can_book_directly, priority?, note?
  }]

  // AI behaviour
  special_instructions?: string[]  // Owner-defined rules injected into system prompt
  faq?: [{ question, answer }]     // Q&A the AI can answer directly

  // Emergency
  emergency_number?: string        // Triggers transferCall tool
  emergency_protocol?: {
    during_hours: string
    after_hours: string
  }

  // Scheduling
  slot_duration_default?: number   // Minutes per slot (default: 30 for home services, use 60)
  buffer_between_appointments?: number  // Minutes between slots (default: 5, use 30)
  max_appointments_per_day?: number

  // Notifications
  transfer_number?: string         // If set, adds transferCall tool to AI
  notification_phone?: string      // For owner SMS alerts (V2)
}
```

### `users` - Dashboard logins

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Same UUID as `auth.users` |
| `clinic_id` | UUID FK | Links to `clinics` |
| `email` | TEXT | |
| `full_name` | TEXT | |
| `role` | ENUM | `owner \| admin \| staff` |

### `calls` - Every Vapi call

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `clinic_id` | UUID FK | |
| `vapi_call_id` | TEXT UNIQUE | Vapi's ID - used by n8n to match events |
| `caller_phone` | TEXT | |
| `status` | ENUM | `in_progress \| completed \| missed \| failed \| transferred` |
| `started_at / ended_at` | TIMESTAMPTZ | |
| `duration_secs` | INTEGER | |
| `transcript` | JSONB | `[{ role: "assistant"\|"user", content, timestamp? }]` |
| `summary` | TEXT | AI-generated call summary |
| `recording_url` | TEXT | |
| `extracted_data` | JSONB | Structured data from the call |
| `outcome` | ENUM | `appointment_booked \| lead_captured \| info_given \| transferred \| missed` |
| `cost_cents` | INTEGER | Vapi cost in cents |

### `leads` - Captured inquiries

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `clinic_id` | UUID FK | |
| `call_id` | UUID FK nullable | Back-link to the call that created it |
| `name / phone / email` | TEXT | |
| `service_needed` | TEXT | What they called about |
| `urgency` | ENUM | `emergency \| urgent \| routine \| inquiry` |
| `notes` | TEXT | |
| `status` | ENUM | `new \| contacted \| booked \| closed \| lost` |

### `appointments` - Confirmed bookings

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `clinic_id` | UUID FK | |
| `call_id / lead_id` | UUID FK nullable | Links to source call and lead |
| `patient_name / patient_phone` | TEXT | |
| `service_type` | TEXT | |
| `scheduled_start / scheduled_end` | TIMESTAMPTZ | |
| `status` | ENUM | `confirmed \| cancelled \| completed \| no_show \| rescheduled` |
| `google_cal_event_id` | TEXT | Stored for future Google Calendar integration |

### Row Level Security

All 5 tables have RLS enabled. Policy: users can only access rows where `clinic_id` matches their own clinic (`clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())`). The edge functions and n8n use the **service role key** to bypass RLS for writes.

### Indexes

```sql
idx_calls_clinic_created      ON calls(clinic_id, created_at DESC)
idx_calls_vapi_id             ON calls(vapi_call_id)
idx_leads_clinic_created      ON leads(clinic_id, created_at DESC)
idx_leads_clinic_status       ON leads(clinic_id, status)
idx_appointments_clinic_start ON appointments(clinic_id, scheduled_start)
idx_users_clinic              ON users(clinic_id)
```

---

## 5. Edge Functions

All three are deployed on Supabase, `verify_jwt: false` (Vapi and n8n call them without a user JWT). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase runtime.

### `assistant-request`

**URL:** `https://drtifnpjpnjomhqljwrl.supabase.co/functions/v1/assistant-request`
**Trigger:** Vapi fires this on every inbound call before connecting

**Flow:**
1. Extract `phoneNumberId` from POST body (`body.phoneNumberId` or `body.call.phoneNumberId`)
2. `SELECT * FROM clinics WHERE vapi_phone_id = ? AND status = 'active'`
3. Build full assistant config dynamically from DB row:
   - System prompt: identity, speech style, special instructions, services, FAQ, hours, location, call handling rules, prohibitions
   - Voice: ElevenLabs `rachel`
   - Model: GPT-4o-mini, temp 0.3
   - Tools: `capture_lead`, `check_availability`, `book_appointment`, optional `transferCall`
   - `serverUrl`: n8n vapi-events webhook
   - Max duration: 300s, silence timeout: 15s
4. Return `{ assistant: config }`

**Environment secrets needed:**
- `N8N_BASE_URL` - n8n Railway URL
- `N8N_WEBHOOK_SECRET` - shared secret for tool calls

---

### `check-availability`

**URL:** `https://drtifnpjpnjomhqljwrl.supabase.co/functions/v1/check-availability?clinic_id={id}`
**Trigger:** Vapi AI calls this as a tool mid-call

**Flow:**
1. Read `clinic_id` from query string (embedded by `assistant-request` in the tool server URL)
2. Read `date` from POST body (YYYY-MM-DD, provided by the AI)
3. Load clinic `settings` (operating_hours, slot_duration_default, buffer_between_appointments)
4. Determine open/close for requested day of week
5. Load existing `confirmed` + `rescheduled` appointments for that day
6. Generate free slots using slot duration + buffer, skipping past times and booked ranges
7. Return `{ slots: string[], timezone: string, slot_duration_minutes: number }`

**Slot defaults for home services:**
- `slot_duration_default`: 60 min (set in clinic settings)
- `buffer_between_appointments`: 30 min (set in clinic settings)

---

### `vapi-events`

**URL:** `https://drtifnpjpnjomhqljwrl.supabase.co/functions/v1/vapi-events`
**Trigger:** Vapi fires this at end of call (also configured in n8n's vapi-events workflow)

**Flow:**
1. Parse body as `VapiCallPayload`
2. Skip if `message.type !== "end-of-call-report"`
3. Extract `vapi_call_id` from `message.call.id`
4. Infer `outcome` from `extractedVariables` (priority) then summary keyword scan fallback
5. `UPDATE calls SET status='completed', summary, recording_url, duration_secs, outcome, extracted_data, cost_cents WHERE vapi_call_id = ?`

---

## 6. n8n Workflows (Railway)

| Webhook path | Trigger | Action |
|-------------|---------|--------|
| `/webhook/call-started` | Vapi call.started event | `INSERT INTO calls (status=in_progress, vapi_call_id, clinic_id)` |
| `/webhook/capture-lead` | AI calls capture_lead tool | `INSERT INTO leads` |
| `/webhook/check-availability` | (bypassed - AI calls edge fn directly) | Not used |
| `/webhook/book-appointment` | AI calls book_appointment tool | `INSERT INTO appointments` |
| `/webhook/vapi-events` | Vapi end-of-call-report | `UPDATE calls` (transcript, summary, recording) |

All n8n workflows use the **service role key** for Supabase writes.

**Important:** n8n must be updated to use the correct Supabase URL: `drtifnpjpnjomhqljwrl.supabase.co` (the old workflows had `odefnvrtbklydspokdmc.supabase.co` hardcoded).

---

## 7. Dashboard (Vite SPA)

**Deploy:** Vercel static hosting. `vercel.json` builds with `npx vite build`, rewrites all routes to `index.html` for SPA mode.

**Stack:** Vite + React 19 + TanStack Router (file-based) + TanStack Query + Supabase JS (anon key)

### Auth Flow

```
AuthProvider (src/lib/auth.tsx)
  └── supabase.auth.getSession() on mount
  └── supabase.auth.onAuthStateChange() subscription
  └── fetchUserData(userId) → SELECT clinic_id, full_name, role FROM users
  └── exposes: user, session, clinicId, profile, signIn(), signOut()

Route guards:
  _auth.tsx      → if logged in → redirect to /
  _dashboard.tsx → if not logged in → redirect to /login
```

### Pages

| Route | Component | Data |
|-------|-----------|------|
| `/` | OverviewPage | `getBriefing()` - 6 parallel queries: calls today, leads today, appointments today, today's appointment list, exception calls, recent calls feed |
| `/calls` | CallsPage | `getCalls(page, pageSize)` - paginated, newest first |
| `/calls/:id` | CallDetailPage | `getCallById()` + `getLeadByCallId()` + `getAppointmentByCallId()` |
| `/leads` | LeadsPage | `getLeads(page, pageSize, status?)` - filterable by status |
| `/settings` | SettingsPage | `getClinicSettings()` - full clinic row including settings JSONB |

### Data Layer (`src/lib/api.ts`)

All queries go through Supabase JS client using the anon key. RLS enforces data isolation per clinic. Key functions:

- `getBriefing()` - 6 parallel Supabase queries for the overview page, returns today's operational snapshot
- `getWeeklyCallStats()` - 7 days × 3 tables = 21 parallel queries using `Promise.all`
- `getOutcomeBreakdown()` - full calls table scan for outcome counts (consider adding a materialized view at scale)
- `markCallHandled()`, `markLeadContacted()`, `markLeadBooked()` - single-field mutations
- `updateClinicSettings()` - replaces the entire `settings` JSONB column
- `updateClinicTopLevel()` - updates top-level clinic fields (name, phone, etc.)

---

## 8. AI Call Config

### System Prompt Structure (built dynamically per business)

```
# Who You Are          ← business name, owner name, tagline
# How You Speak        ← tone, sentence length, empathy rules
# Special Instructions ← owner-defined rules (from settings.special_instructions)
# Services Offered     ← from settings.service_details or settings.services
# Common Questions     ← from settings.faq
# Business Hours       ← from settings.operating_hours or settings.hours
# Location             ← from settings.address + settings.landmark
# How to Handle Calls  ← booking flow, pricing rules, emergency protocol, edge cases
# What You Must NOT Do ← prohibitions
```

### Tools Wired to Each Call

| Tool | Routes to | When used |
|------|-----------|-----------|
| `capture_lead` | n8n `/webhook/capture-lead` | Can't complete booking, or caller wants callback |
| `check_availability` | Edge fn `/check-availability?clinic_id=...` | Before offering time slots |
| `book_appointment` | n8n `/webhook/book-appointment` | After caller confirms a slot |
| `transferCall` | Vapi direct (to `settings.transfer_number`) | Only added if transfer number is configured |

### Call Limits

- Max duration: 300 seconds (5 min)
- Silence timeout: 15 seconds
- Background sound: off
- End call phrases: goodbye, bye, thank you, thanks, that's all, no more questions

---

## 9. Environment Variables

### Vercel (browser - public)

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://drtifnpjpnjomhqljwrl.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` (public, safe to expose) |

### Supabase Edge Function Secrets (set via Supabase dashboard)

| Variable | Notes |
|----------|-------|
| `SUPABASE_URL` | Auto-injected by runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by runtime |
| `N8N_BASE_URL` | `https://primary-production-3207.up.railway.app` |
| `N8N_WEBHOOK_SECRET` | Shared secret for tool call authentication |

### n8n (Railway)

| Variable | Notes |
|----------|-------|
| `SUPABASE_URL` | `https://drtifnpjpnjomhqljwrl.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Full write access, bypasses RLS |

---

## 10. What's Live vs What's Next

### Live (V1)

- Vapi phone number `+13236182058` wired to `assistant-request` edge function
- Dynamic AI config built from `Swift Home Services` DB settings per call
- Real availability checking from `appointments` table
- Lead capture and appointment booking via n8n
- Call records updated post-call via n8n vapi-events
- Dashboard: calls, leads, appointments, overview, settings

### V2 Priorities (per product roadmap)

- Realtime call dashboard with live transcript streaming
- AI urgency scoring 1-5 (score 5 = phone call to owner, not just notification)
- Estimated job value display during live call
- Outbound follow-up SMS sequences (1hr, 4hr, next morning if no booking)
- Google Calendar sync for real availability

### Known Gaps

- `settings.slot_duration_default` should be 60 min for home services (currently defaults to 30) - update Swift Home Services row
- `settings.buffer_between_appointments` should be 30 min - update DB row
- n8n workflows contain hardcoded old Supabase URL (`odefnvrtbklydspokdmc`) - must be updated
- `N8N_BASE_URL` and `N8N_WEBHOOK_SECRET` not yet set in Supabase edge function secrets - `capture_lead` and `book_appointment` tools will fail until set
- `calls.language_detected` defaults to `en\|hi` - irrelevant for US market, but harmless
- `ClinicSettings.doctor_name` field name is a dental artifact - functionally works but should be renamed `owner_name` in a future migration

---

## 11. Pricing Context (for feature decisions)

| Tier | Price | Minutes | Gross Margin |
|------|-------|---------|-------------|
| Starter | $149/mo | 500 min | ~70% |
| Growth | $299/mo | 1,200 min | ~67% |
| Pro | $499/mo | 2,500 min | ~61% |

Vapi costs $0.05-0.10/min. A 30-call/day shop uses ~3,600 min/mo = $252 Vapi cost alone. **No unlimited plans. Hard caps with overage pricing only.**

Every feature must answer: does this directly save or make money for the owner today?
