# How Orvia Works

A complete guide to the Orvia system -- from a phone ringing to data appearing on a dashboard. Read this to understand the entire architecture in about 15 minutes.

---

## 1. System Overview

**What is Orvia?** Orvia is an AI-powered phone receptionist for dental clinics. When a patient calls a clinic's phone number, they talk to an AI that sounds like a real receptionist -- it can answer questions about services, check appointment availability, book appointments, and capture lead information. Everything the AI does gets recorded in a database that clinic owners can view through a web dashboard.

**Who is it for?** Initially, dental clinics in India. The system is designed to be multi-tenant from day one, meaning one deployment serves many clinics, each with their own phone number, their own data, and their own customized AI personality.

**The 30-second version of how it works:**

1. Patient calls a phone number
2. Vapi (voice AI platform) answers and asks our server "how should I behave for this phone number?"
3. Our server looks up the clinic, builds a custom AI configuration, and sends it back
4. Vapi uses that config to have a natural conversation with the patient
5. During the call, the AI can check availability, book appointments, or capture leads by calling webhook endpoints
6. After the call ends, all the data (transcript, recording, duration, cost) gets stored in the database
7. The clinic owner sees everything on their dashboard in real-time

**The tech stack:**

| Component | Technology | Where it runs |
|-----------|-----------|---------------|
| Voice AI | Vapi | Vapi's cloud |
| LLM | GPT-4o-mini (via Vapi) | OpenAI |
| Voice synthesis | ElevenLabs (via Vapi) | ElevenLabs |
| Web app + API | Next.js 16 | Vercel |
| Workflow automation | n8n | Railway |
| Database + Auth | Supabase (Postgres) | Supabase cloud |

---

## 2. The Call Flow (Step by Step)

Here is exactly what happens when a patient calls, from the moment the phone rings to the data showing up on the dashboard.

### The text-based diagram

```
  Patient dials clinic number
          |
          v
  +-------+--------+
  |      Vapi       |  (Voice AI platform -- answers the call)
  |                 |
  |  "Which assistant|
  |   should I use?" |
  +-------+---------+
          |
          | POST /api/vapi/assistant-request
          v
  +-------+---------+
  |   Vercel         |  (Next.js API route)
  |                  |
  |  1. Extract      |
  |     phoneNumberId|
  |  2. Look up      |
  |     clinic in    |
  |     Supabase     |
  |  3. Build        |
  |     assistant    |
  |     config       |
  +-------+----------+
          |
          | Returns { assistant: { model, voice, tools, systemPrompt, ... } }
          v
  +-------+--------+
  |      Vapi       |
  |                 |
  |  Now talks to   |
  |  the patient    |
  |  using the      |
  |  config we sent |
  +---+---+---+----+
      |   |   |
      |   |   |  (AI decides to call tools during conversation)
      |   |   |
      v   v   v
  +---+---+---+----+
  |      n8n        |  (Webhook workflows on Railway)
  |                 |
  |  /capture-lead  |  --> saves lead to Supabase
  |  /check-avail   |  --> returns open time slots
  |  /book-appt     |  --> creates appointment in Supabase
  |  /call-started  |  --> creates call record in Supabase
  |  /vapi-events   |  --> updates call with transcript, recording, etc.
  +-------+---------+
          |
          | All data written to...
          v
  +-------+---------+
  |    Supabase      |  (Postgres database)
  |                  |
  |  clinics         |
  |  users           |
  |  calls           |
  |  leads           |
  |  appointments    |
  +-------+----------+
          |
          | Read by...
          v
  +-------+---------+
  |    Dashboard     |  (Next.js on Vercel)
  |                  |
  |  /overview       |  Stats, charts, recent calls
  |  /calls          |  Paginated call list
  |  /calls/:id      |  Call detail + transcript
  |  /leads          |  Lead management
  |  /settings       |  Clinic settings (read-only)
  +------------------+
```

### Step-by-step walkthrough

**Step 1: Patient calls.** The patient dials the phone number that is provisioned through Vapi. Vapi picks up the call.

**Step 2: Vapi asks "who am I?"** Vapi doesn't store a permanent assistant for Orvia. Instead, it sends a POST request to our `assistant-request` webhook every time a call comes in. This is called a "transient assistant" -- the config is built fresh for every call. This is important because it means we can change a clinic's settings (hours, services, greeting) and the very next call will use the updated config.

**Step 3: We look up the clinic.** The webhook receives a payload containing `message.call.phoneNumberId` -- that is the Vapi phone number ID. We query Supabase: "give me the active clinic whose `vapi_phone_id` matches this." If no clinic is found, we return a 404 and Vapi handles the error gracefully.

**Step 4: We build the assistant config.** Using the clinic's `settings` JSONB column (which contains everything -- services, hours, FAQ, doctor name, emergency protocol), we dynamically build a complete Vapi assistant configuration. This includes the system prompt, the voice, the greeting, the tools, and behavior settings like silence timeout and max call duration. More details in Section 6.

**Step 5: The AI talks to the patient.** Vapi now has everything it needs. It uses GPT-4o-mini as the brain, ElevenLabs for voice synthesis, and the system prompt we wrote to guide the conversation. The patient and AI have a natural phone conversation.

**Step 6: Mid-call tool use.** If the AI needs to do something -- check available slots, book an appointment, or save a lead -- it calls one of the tools we defined. These tools are HTTP endpoints on n8n. Vapi sends the tool call parameters to n8n, n8n does the work (usually writing to Supabase), and returns a result that the AI reads back to the patient. For example: "I have slots available at 2 PM, 3:30 PM, and 5 PM -- which works best for you?"

**Step 7: Call ends.** When the call finishes (patient hangs up, AI says goodbye, or the 5-minute max is hit), Vapi fires an event to the `vapi-events` webhook. This contains the full transcript, a summary, the recording URL, call duration, and cost.

**Step 8: n8n stores the data.** The call-ended workflow parses this payload and updates the call record in Supabase with all the post-call data.

**Step 9: Dashboard shows it.** The clinic owner logs in and sees everything: calls, transcripts, leads, appointments, charts, and stats. The `calls` table has Supabase Realtime enabled, so new calls can appear without a page refresh.

---

## 3. Component Architecture

### Vapi -- the voice AI platform

Vapi is the engine that actually handles phone calls. Think of it as the "Twilio + AI" layer. It:

- Provisions phone numbers (Indian numbers for our use case)
- Handles speech-to-text (turning the caller's voice into text)
- Sends that text to an LLM (GPT-4o-mini in our case)
- Takes the LLM's text response and converts it to speech (ElevenLabs)
- Manages the real-time call loop (listen -> think -> speak -> repeat)
- Executes tool calls by sending HTTP requests to our n8n webhooks
- Fires server events (call started, call ended) to our event webhook

**How it is configured:** We do NOT use Vapi's permanent assistant feature. Instead, we use the "assistant-request" pattern -- Vapi calls our server on every inbound call, and we return a fresh config. This means Vapi only needs to know one thing: the webhook URL to call for assistant requests.

**Phone number setup:** Each clinic gets a Vapi phone number. The Vapi phone number ID is stored in the `clinics.vapi_phone_id` column. When a call comes in on that number, Vapi includes the phone number ID in its request, and we use that to look up the clinic.

### Vercel (Next.js) -- the dashboard AND the API

The Next.js app serves two purposes:

1. **The assistant-request API** (`/api/vapi/assistant-request`) -- this is the webhook that Vapi calls. It runs as a serverless function on Vercel. It uses the Supabase service role key (not the anon key) because this request comes from Vapi, not from a browser with cookies.

2. **The dashboard** -- a server-rendered web app where clinic owners view their data. Uses the Next.js App Router with route groups: `(auth)` for login, `(dashboard)` for the main pages.

The dashboard uses **server components** everywhere for data fetching. There are no client-side API calls for loading data -- everything is fetched on the server using the Supabase SSR client (which reads auth cookies from the request). This is fast and secure.

### n8n on Railway -- the workflow automation layer

n8n is a self-hosted automation platform (think Zapier, but you own it). It runs on Railway and handles all the mid-call and post-call data processing through 5 webhook workflows.

Why n8n instead of more Next.js API routes? Two reasons:
1. **Vapi tool calls have a specific format** -- they send `toolCallList` and expect `results` back. n8n makes it easy to parse and respond to these without writing boilerplate.
2. **Future extensibility** -- when we add WhatsApp notifications, Google Calendar sync, or SMS confirmations, n8n makes it trivial to add those steps to existing workflows without touching code.

### Supabase -- the database, auth, and realtime layer

Supabase provides three things:

1. **Postgres database** -- 5 tables with Row Level Security. All clinic data lives here.
2. **Authentication** -- email/password login for clinic owners. Supabase Auth manages sessions, JWTs, and password resets.
3. **Realtime** -- the `calls` table has Supabase Realtime enabled, so the dashboard can subscribe to new calls as they happen.

There are **two different Supabase clients** in the codebase:
- **SSR client** (`src/lib/supabase/server.ts`) -- used by the dashboard. Reads auth cookies, respects RLS policies.
- **Service role client** (created inline in the assistant-request route) -- used by the Vapi webhook. Bypasses RLS because there is no browser session.

---

## 4. Data Model

Five tables, all in the `public` schema.

### clinics

The tenant table. One row per clinic.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Primary key |
| name | TEXT | Display name ("Dr. Sharma's Dental Care") |
| slug | TEXT (unique) | URL-safe identifier |
| phone_display | TEXT | Human-readable phone number for display |
| vapi_phone_id | TEXT | Vapi's internal phone number ID -- used for clinic lookup |
| vapi_assistant_id | TEXT | Not used currently (we use transient assistants) |
| timezone | TEXT | Default: "Asia/Kolkata" |
| settings | JSONB | The big one -- all clinic configuration (see below) |
| status | TEXT | "active", "inactive", or "onboarding" |

The `settings` JSONB column contains everything about the clinic: doctor name, services with pricing, FAQ, operating hours per day, emergency protocol, receptionist personality, special instructions, calendar config, and more. See the `ClinicSettings` type in `src/lib/types.ts` for the full shape.

### users

Dashboard users linked to Supabase Auth.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK, FK -> auth.users) | Matches the Supabase Auth user ID |
| clinic_id | UUID (FK -> clinics) | Which clinic this user belongs to |
| email | TEXT | Login email |
| full_name | TEXT | Display name |
| role | TEXT | "owner", "admin", or "staff" |

### calls

Every phone call handled by the AI.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Primary key |
| clinic_id | UUID (FK -> clinics) | Which clinic this call belongs to |
| vapi_call_id | TEXT (unique) | Vapi's internal call ID |
| caller_phone | TEXT | The patient's phone number |
| language_detected | TEXT | "en" or "hi" |
| status | TEXT | "in_progress", "completed", "missed", "failed", "transferred" |
| started_at | TIMESTAMPTZ | When the call started |
| ended_at | TIMESTAMPTZ | When the call ended |
| duration_secs | INTEGER | Call duration in seconds |
| transcript | JSONB | Array of `{ role, content, timestamp }` turns |
| summary | TEXT | AI-generated summary of the call |
| recording_url | TEXT | URL to the call recording |
| extracted_data | JSONB | Any structured data extracted during the call |
| outcome | TEXT | "appointment_booked", "lead_captured", "info_given", "transferred", "missed" |
| cost_cents | INTEGER | Vapi cost in cents |

### leads

Patient contact information captured during calls.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Primary key |
| clinic_id | UUID (FK -> clinics) | Which clinic |
| call_id | UUID (FK -> calls) | Which call generated this lead |
| name | TEXT | Patient name |
| phone | TEXT | Patient phone |
| email | TEXT | Patient email (optional) |
| service_needed | TEXT | What they called about |
| urgency | TEXT | "emergency", "urgent", "routine", "inquiry" |
| notes | TEXT | Additional details |
| status | TEXT | "new", "contacted", "booked", "closed", "lost" |

### appointments

Bookings made by the AI during calls.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Primary key |
| clinic_id | UUID (FK -> clinics) | Which clinic |
| lead_id | UUID (FK -> leads) | Optional link to a lead |
| call_id | UUID (FK -> calls) | Which call created this booking |
| patient_name | TEXT | Patient name |
| patient_phone | TEXT | Patient phone |
| service_type | TEXT | Type of service booked |
| scheduled_start | TIMESTAMPTZ | Appointment start time |
| scheduled_end | TIMESTAMPTZ | Appointment end time |
| notes | TEXT | Any notes |
| status | TEXT | "confirmed", "cancelled", "completed", "no_show", "rescheduled" |
| google_cal_event_id | TEXT | For future Google Calendar sync |

### Relationships

```
clinics (1) ----< (many) users
clinics (1) ----< (many) calls
clinics (1) ----< (many) leads
clinics (1) ----< (many) appointments

calls (1) ----< (many) leads       (a call can generate a lead)
calls (1) ----< (many) appointments (a call can create an appointment)
leads (1) ----< (many) appointments (a lead can have appointments)
```

Everything fans out from `clinics`. The `clinic_id` column is on every table and is the foundation of multi-tenancy.

---

## 5. Multi-Tenant Architecture

### How one system serves multiple clinics

Every piece of data in the system is scoped to a `clinic_id`. When Clinic A's owner logs in, they only see Clinic A's calls, leads, and appointments. Clinic B's data is completely invisible.

This isolation works at three levels:

**Level 1: Database (RLS).** Row Level Security policies on every table ensure that a database query can only return rows belonging to the user's clinic. The policy logic is:

```sql
-- Example: the calls policy
CREATE POLICY "calls_own_clinic" ON calls
    FOR ALL USING (
        clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    );
```

This means: "a user can only see calls where the `clinic_id` matches the clinic they belong to." The same pattern applies to all five tables. Even if there is a bug in application code, the database itself will never leak cross-clinic data.

**Level 2: Application (queries).** All dashboard queries go through the SSR Supabase client, which authenticates using the user's session cookie. Because RLS is enforced, these queries automatically filter to the user's clinic without any explicit WHERE clause in the application code.

**Level 3: Voice AI (phone number lookup).** Each clinic has its own Vapi phone number. When a call comes in, the assistant-request webhook looks up the clinic by `vapi_phone_id`. There is no way for a call on Clinic A's number to accidentally load Clinic B's configuration.

### How new clinics get onboarded

Currently, onboarding is a manual process:

1. Create a clinic row in the `clinics` table with the clinic's settings (using the template at `config/clinic-onboarding-template.json` as a guide)
2. Provision a Vapi phone number and store the ID in `vapi_phone_id`
3. Create a Supabase Auth user and link them in the `users` table
4. Set the clinic status to "active"

There is no self-service onboarding yet -- it is a planned feature.

---

## 6. The Assistant Config Builder

This is the heart of what makes each clinic's AI receptionist unique. The code lives in `src/lib/vapi/build-assistant-config.ts`.

### What it does

It takes a clinic's `settings` JSONB and turns it into a complete Vapi assistant configuration. Think of it like a template engine for AI personalities.

### The output structure

```typescript
{
  model: {
    provider: "openai",
    model: "gpt-4o-mini",
    systemPrompt: "...",     // The big one -- multi-section prompt
    temperature: 0.3,        // Low temperature = more consistent behavior
  },
  voice: {
    provider: "11labs",
    voiceId: "rachel",       // English voice -- needs revisiting for Hindi
  },
  firstMessage: "Thank you for calling Dr. Sharma's Dental Care. This is Orvia, how can I help you today?",
  tools: [ ... ],            // capture_lead, check_availability, book_appointment, transferCall
  endCallPhrases: ["goodbye", "bye", "thank you", ...],
  serverUrl: "https://n8n.railway.app/webhook/vapi-events",  // Where call events go
  silenceTimeoutSeconds: 15,
  maxDurationSeconds: 300,   // 5 min hard limit per call
  backgroundSound: "off",
}
```

### The system prompt structure

The system prompt is built from multiple sections, each conditionally included based on what the clinic has configured:

1. **Identity** -- "You are Orvia, the AI receptionist for Dr. Sharma's Dental Care."
2. **Communication style** -- Rules for how to speak: short sentences, one question at a time, use the caller's name, be empathetic.
3. **Special instructions** -- Custom rules from the clinic owner, like "always reassure nervous patients."
4. **Services** -- Each service with description, duration, price range, and whether it can be booked directly or needs a consultation.
5. **FAQ** -- Common questions and answers the AI can use.
6. **Operating hours** -- Per-day schedule with lunch breaks.
7. **Location** -- Address and landmark.
8. **Call handling rules** -- Detailed instructions for different scenarios: patient wants appointment, patient asking about pricing, emergency/pain, wants to talk to doctor, non-patient calls, system errors.
9. **Boundaries** -- What the AI must NOT do: no medical advice, no exact prices, no sharing patient info.

The prompt is designed to make the AI sound like a real human receptionist who works at this specific clinic, not a generic call center bot.

### Tools

Three function tools and one optional transfer tool:

- **capture_lead** -- saves patient contact info when a booking cannot be completed
- **check_availability** -- checks open appointment slots for a given date
- **book_appointment** -- books a confirmed appointment
- **transferCall** (optional) -- transfers the call to a human, only if a transfer number is configured

Each function tool has a `server.url` pointing to the corresponding n8n webhook.

---

## 7. n8n Webhook Details

Five workflows run on n8n, created programmatically by `scripts/create-n8n-workflows.mjs`.

### Workflow 1: Call Started (`/webhook/call-started`)

**Triggered by:** Vapi server event at the start of a call.

**What it does:**
1. Parses `vapi_call_id`, `phoneNumberId`, and `caller_phone` from the payload
2. Looks up the clinic by `vapi_phone_id` in Supabase
3. Creates a new row in the `calls` table with status `in_progress`
4. Returns `{ success: true }`

### Workflow 2: Capture Lead (`/webhook/capture-lead`)

**Triggered by:** Vapi tool call during a conversation.

**What Vapi sends:**
```json
{
  "message": {
    "call": { "id": "vapi-call-uuid" },
    "functionCall": {
      "parameters": {
        "name": "Rahul Sharma",
        "phone": "+919876543210",
        "service_needed": "root canal",
        "urgency": "urgent",
        "notes": "Patient in pain since yesterday"
      }
    }
  }
}
```

**What it does:**
1. Parses the function call parameters
2. Looks up the call record by `vapi_call_id` to get `call_id` and `clinic_id`
3. Inserts a new lead into the `leads` table
4. Returns a natural-language result that the AI reads to the patient: "Lead captured successfully. The clinic team has been notified and will contact the patient shortly."

### Workflow 3: Check Availability (`/webhook/check-availability`)

**Triggered by:** Vapi tool call when the AI needs to offer appointment slots.

**What Vapi sends:**
```json
{
  "message": {
    "functionCall": {
      "parameters": {
        "date": "2026-03-22",
        "service_type": "teeth cleaning"
      }
    }
  }
}
```

**What it does (MVP):**
1. Generates standard clinic time slots (10 AM - 6:30 PM, 30-minute intervals, with lunch break skipped)
2. Randomly removes some to simulate existing bookings
3. Returns the available slots as a string the AI can read

**Important:** This is the MVP implementation. It does NOT check real calendar availability yet. When Google Calendar integration is built, this workflow will query the actual calendar instead of generating random slots.

### Workflow 4: Book Appointment (`/webhook/book-appointment`)

**Triggered by:** Vapi tool call after the patient has selected a slot.

**What Vapi sends:**
```json
{
  "message": {
    "call": { "id": "vapi-call-uuid" },
    "functionCall": {
      "parameters": {
        "patient_name": "Rahul Sharma",
        "patient_phone": "+919876543210",
        "service_type": "teeth cleaning",
        "slot": "2026-03-22T14:30:00+05:30"
      }
    }
  }
}
```

**What it does:**
1. Parses the booking parameters
2. Looks up the call record to get `clinic_id`
3. Inserts a new appointment in the `appointments` table with status `confirmed`
4. Returns a confirmation message the AI reads: "Appointment confirmed for Rahul Sharma on 2026-03-22T14:30:00+05:30 for teeth cleaning."

### Workflow 5: Call Ended / Vapi Events (`/webhook/vapi-events`)

**Triggered by:** Vapi server events (configured via `serverUrl` in the assistant config).

**What it does:**
1. Receives all Vapi events, but only processes `end-of-call-report` and `status-update` (with status "ended")
2. Extracts: transcript, recording URL, summary, duration, cost
3. Updates the existing call record in Supabase with the post-call data (sets status to "completed")
4. Ignores all other event types (like `speech-update`, `transcript`, etc.) with a skip response

### The Vapi tool-call response format

When Vapi calls a tool, it expects a specific response format. The n8n workflows return:

```json
{
  "result": "Human-readable text that the AI will speak to the patient"
}
```

The AI takes this `result` string and uses it as context for its next response. It does not read it verbatim -- it paraphrases naturally.

---

## 8. Dashboard Architecture

### Framework

Next.js 16 with the App Router, deployed on Vercel. React 19, Tailwind CSS 4, shadcn/ui components, Recharts for charts.

### Route structure

```
src/app/
  layout.tsx                    # Root layout (global styles, fonts)
  (auth)/
    layout.tsx                  # Auth layout (centered card)
    login/page.tsx              # Login page (email + password)
  (dashboard)/
    layout.tsx                  # Dashboard shell (sidebar + header)
    page.tsx                    # /  -- Overview with stats, charts, recent calls
    calls/
      page.tsx                  # /calls  -- Paginated call list
      [id]/page.tsx             # /calls/:id  -- Call detail with transcript
    leads/
      page.tsx                  # /leads  -- Lead management with status filter
    settings/
      page.tsx                  # /settings  -- Clinic settings (read-only)
  api/
    vapi/
      assistant-request/
        route.ts                # POST -- Vapi assistant-request webhook
```

### Authentication flow

1. **Middleware** (`src/lib/supabase/middleware.ts`) runs on every request. It refreshes the Supabase session and redirects unauthenticated users to `/login`. The `/api/` routes are excluded from auth checks (since the Vapi webhook has no user session).

2. **Server components** use the SSR Supabase client (`src/lib/supabase/server.ts`) which reads cookies. Because RLS is enabled, all queries are automatically scoped to the logged-in user's clinic.

3. **No client-side data fetching.** All data loading happens in server components using `async` functions from `src/lib/queries.ts`. This keeps the dashboard fast and secure -- there are no exposed API endpoints for the dashboard data.

### Key patterns

- **Route groups** `(auth)` and `(dashboard)` share different layouts but live under the same URL structure
- **Server components everywhere** -- only interactive components (charts) use `"use client"`
- **Queries file** (`src/lib/queries.ts`) centralizes all database access. Every page imports from here rather than calling Supabase directly.
- **Parallel data fetching** -- the overview page uses `Promise.all` to fetch stats, recent calls, weekly data, and outcome breakdown in parallel

---

## 9. Environment Variables

All env vars are defined in `.env.local`. See `.env.local.example` for the template.

### Required for the dashboard

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (e.g., `https://xxx.supabase.co`). Public -- exposed to the browser for auth. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. Used by the browser and SSR client. Respects RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key. Bypasses RLS. Used ONLY by the assistant-request API route (server-side). Never expose this to the browser. |

### Required for voice AI

| Variable | Purpose |
|----------|---------|
| `VAPI_API_KEY` | Vapi API key for managing phone numbers and assistants. Not currently used at runtime (phone setup is manual). |
| `VAPI_WEBHOOK_SECRET` | Shared secret for verifying Vapi webhook signatures. Not yet implemented -- planned for security hardening. |

### Required for n8n integration

| Variable | Purpose |
|----------|---------|
| `N8N_BASE_URL` | Base URL of the n8n instance (e.g., `https://primary-production-3207.up.railway.app`). Used to build tool webhook URLs in the assistant config. |
| `N8N_WEBHOOK_SECRET` | Shared secret sent with tool call requests. Not yet validated on the n8n side -- planned for security hardening. |

### Future (not yet connected)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT` | Base64-encoded Google service account JSON for calendar integration. |
| `WHATSAPP_API_TOKEN` | WhatsApp Business API token for sending appointment confirmations. |
| `WHATSAPP_PHONE_ID` | WhatsApp phone number ID. |
| `WHATSAPP_BUSINESS_ID` | WhatsApp Business account ID. |

---

## 10. Known Limitations & Future Work

### What works now

- Inbound calls answered by AI with per-clinic configuration
- Lead capture during calls
- Appointment booking during calls (with simulated availability)
- Post-call data storage (transcript, recording, summary, cost)
- Dashboard with overview stats, call list, call detail, lead management, settings view
- Multi-tenant data isolation via RLS
- Email/password authentication

### What is manual

- **Clinic onboarding** -- adding a new clinic requires manually inserting rows in the database. There is a template JSON (`config/clinic-onboarding-template.json`) to guide this process, but no self-service UI.
- **Vapi phone number provisioning** -- buying and configuring phone numbers is done through the Vapi dashboard manually.
- **n8n workflow deployment** -- workflows are created via the `scripts/create-n8n-workflows.mjs` script, but updating them requires re-running the script (which deletes and recreates all workflows).

### What is not connected yet

- **Google Calendar** -- the data model supports it (`google_cal_event_id`, calendar settings in clinic config), and the check-availability workflow has a placeholder, but real calendar queries are not implemented. Currently, availability is randomly generated.
- **WhatsApp notifications** -- the onboarding template has notification preferences, but no WhatsApp integration exists yet. Planned to send appointment confirmations and new-lead alerts via WhatsApp.
- **SMS notifications** -- same as WhatsApp, not yet built.
- **Webhook signature verification** -- Vapi and n8n webhook requests are not cryptographically verified. The `webhookSecret` is passed in the config but not validated on the n8n side.

### Voice quality concerns

- **Hindi/bilingual support** -- the voice is currently hardcoded to ElevenLabs "rachel" which is English-only. For Indian clinics where patients may speak Hindi or mix Hindi and English, a different voice and possibly a different STT model will be needed.
- **Latency** -- Vapi -> GPT-4o-mini -> ElevenLabs round-trip can sometimes feel slow. Vapi has options for faster models and voice providers that have not been explored yet.
- **5-minute limit** -- calls are capped at 300 seconds. This is intentional for cost control but may need adjustment for complex conversations.

### Planned features

- Self-service clinic onboarding wizard
- Google Calendar integration for real availability checking
- WhatsApp appointment confirmations
- Call outcome auto-classification (currently relies on the AI's tool usage)
- Dashboard analytics (conversion rates, peak hours, cost tracking)
- Settings editing (currently read-only)
- Multi-language voice support (Hindi, bilingual)
- Webhook signature validation for security
- Supabase Realtime for live call updates on the dashboard
