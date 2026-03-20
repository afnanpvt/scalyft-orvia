# Orvia - Research & Strategic Plan

## Executive Summary

Orvia is an AI-powered front desk system for dental clinics in India, built by Scalyft (2-person technical team). It replaces or augments the human receptionist by answering every inbound patient call in Hindi or English, capturing patient details, and booking appointments into Google Calendar -- then notifying the clinic owner via WhatsApp.

The India dental market is the initial target -- not because it's the biggest opportunity, but because Scalyft needs to build product, sales, and operational experience before entering higher-value markets (US home services is the long-term play). India dental has no direct AI receptionist competitors, giving Orvia first-mover advantage in a market the team understands natively.

The MVP ships in 2-3 weeks. First 2-3 paying customers within 30 days. Stack: Vapi (voice AI) + n8n on Railway (workflows) + Supabase (database/auth/realtime) + Next.js on Vercel (dashboard).

---

## Market Research Findings

### Competitive Landscape

There are no direct competitors offering AI voice reception for Indian dental clinics. The competitive landscape is relevant for learning, not direct competition:

**AI-Native Voice Platforms (global):**

| Competitor | Pricing | Target | Key Weakness |
|---|---|---|---|
| Synthflow | $29-1,400/mo | Agencies/SMBs (US) | Generic platform, not verticalized. Requires prompt engineering. |
| Air.ai | ~$0.11/min | Enterprise sales (US) | Reputation damaged -- poor quality, aggressive contracts. |
| Bland.ai | $0.07-0.09/min | Developers | API-only, no end-user product. |
| Goodcall | $59-199/mo | Local US businesses | Basic call handling, no integrations, no Hindi support. |
| Rosie AI | $49-199/mo | US home services | Most direct competitor for future US expansion. No India presence. |

**Traditional Answering Services:**

| Competitor | Pricing | Key Weakness |
|---|---|---|
| Smith.AI | $292-1,350/mo | Expensive, law-firm focused, no India presence. |
| Ruby Receptionists | $235-1,640/mo | Premium pricing, US-only, human-dependent model. |
| AnswerForce | $279-1,199/mo | Home services focus, US-only, inconsistent quality. |

**India-specific landscape:** Indian dental clinics currently use: (1) front desk staff who double as dental assistants, (2) WhatsApp Business for patient communication, (3) the dentist's personal phone, or (4) nothing -- calls just get missed. There is no AI receptionist product serving this market.

### India Dental Market Analysis

- **Market size:** ~270,000+ dental clinics in India, predominantly in Tier-1/Tier-2 cities
- **Current call handling:** Manual -- receptionist, WhatsApp, or the dentist themselves
- **Price sensitivity:** INR 2,000-5,000/month ($25-60/mo) for SaaS tools. 5-10x lower than US equivalents.
- **Language requirements:** Hindi + English covers ~70% of urban India. Regional languages (Tamil, Telugu, Marathi) needed for full coverage but deferred to v2.
- **Regulatory:** DPDPA 2023 (data protection), TRAI telecom rules (call recording disclosure required), Indian Medical Council guidelines (no medical advice from AI)
- **WhatsApp dominance:** WhatsApp Business is the primary communication channel for Indian SMBs. Any product that doesn't integrate with WhatsApp is dead on arrival.

### Common Buyer Objections (India Dental)

1. "Will it sound robotic? My patients will think the clinic is unprofessional." -> Live demo call.
2. "My receptionist already handles calls." -> "What about during procedures, lunch, or after hours?"
3. "This is too technical for me." -> White-glove setup, clinic owner touches nothing.
4. "I don't trust AI with my patients." -> Full transparency -- every call recorded, transcripted, reviewable.
5. "It's too expensive." -> "One missed patient costs INR 2,000-10,000. Orvia costs less than that per month."

---

## Product Gap Analysis

### Where Competitors Are Weakest

1. **No India/Hindi presence** -- Every AI receptionist product is US/English-focused
2. **Setup complexity** -- Most require days of configuration or prompt engineering
3. **Generic, not vertical** -- None understand dental clinic workflows specifically
4. **Post-call is dead** -- They answer the call and email a summary. Nothing happens automatically.
5. **No WhatsApp** -- Critical for India, ignored by US-built products

### Table Stakes vs Differentiators

**Table Stakes (must have at launch):**
- 24/7 call answering in Hindi + English
- Natural-sounding voice (not robotic)
- Patient name + phone capture
- Notification to clinic owner after each call
- Call recording + transcript (all plans -- required for compliance and trust)
- Basic business info handling (hours, location, services)
- Mobile-friendly dashboard

**Differentiators (what wins deals):**
- WhatsApp notification with patient details (instant, where clinic owners already live)
- Appointment booking into Google Calendar (not just "taking a message")
- Pre-built dental clinic call flows (the AI knows what a root canal is)
- White-glove onboarding (15-minute setup, clinic owner does nothing)
- Full transparency dashboard (every call reviewable, trust through visibility)

---

## Technical Landscape Assessment

### Vapi Assessment

- **Pricing:** Pay-as-you-go, ~$0.08-0.12/min all-in (STT + orchestration + TTS). LLM cost separate (your OpenAI key).
- **Free tier:** ~10 free minutes (credit-based). Move to paid quickly.
- **Hindi support:** Deepgram STT supports Hindi. ElevenLabs TTS has Hindi voices. Quality is good but should be tested with real dental terminology.
- **Multi-tenant:** The `assistant-request` webhook enables one Vapi account to serve all clinics. Incoming call -> Vapi hits your endpoint -> you return clinic-specific config dynamically.
- **Function calling:** Mid-call tool calls (capture_lead, book_appointment) hit n8n webhooks. Post-call analysis via `call.ended` webhook.
- **Call transfer:** `transferCall` tool for emergencies -- routes to clinic's direct number.
- **Key gotchas:** (1) Use GPT-4o-mini for voice -- larger models are too slow. (2) Keep system prompts <500 tokens. (3) Call recording requires disclosure in greeting. (4) Background noise degrades Hindi STT -- test with realistic conditions.

**CRITICAL: Validate Indian phone number availability on Vapi before engineering starts.** Vapi provisions numbers via Twilio/Vonage. Indian DID numbers have historically been difficult to obtain through US-based telephony platforms due to TRAI regulations. If Vapi cannot provide Indian numbers, clinics must forward from their existing number to an international Vapi number (adds latency and cost). This is a day-one validation.

### n8n Risks & Mitigation

| Risk | Mitigation |
|---|---|
| n8n downtime = failed mid-call actions | Host on Railway.app with health checks + auto-restart. UptimeRobot monitoring. Vapi assistant falls back to "clinic will call you back." |
| No auto-scaling | Single instance handles ~50-100 concurrent executions. Fine for MVP. |
| Data loss on crash | Use PostgreSQL backend (not default SQLite). |
| No official Vapi node | Use generic Webhook Trigger + HTTP Request nodes. Works fine. |

### Vercel Constraints

- Serverless functions work for webhook receivers and API routes
- No WebSocket support -> solved by Supabase Realtime (client connects to Supabase directly)
- Free tier sufficient for MVP (100K invocations/mo, 100GB bandwidth)
- **Cold start risk:** Vercel free tier cold starts can be 1-3 seconds. The `assistant-request` webhook fires on every inbound call -- if it's slow, callers hear dead air. Mitigation: use Vercel Edge Runtime for this route (no cold starts), or cache clinic configs.

### Database: Supabase

Chosen for: Auth (JWT + RLS), Realtime subscriptions (live dashboard updates), PostgreSQL (flexible, great ORM support), generous free tier (500MB, 2 projects).

**Backup strategy:** Supabase free tier does not include point-in-time recovery. Set up daily `pg_dump` exports to a storage bucket. Call data is the trust foundation -- losing it would be catastrophic.

---

## ICP Definition

### Primary: Indian Dental Clinic Owner

- **Industry:** Dental clinics in Tier-1/Tier-2 Indian cities
- **Size:** 1-5 dentists, 1-2 front desk staff, 20-60 patient calls/day
- **Buyer:** The clinic owner (managing dentist) -- signs the check AND uses the product
- **Technical level:** WhatsApp-savvy, uses basic apps, will NOT self-configure anything
- **Budget:** INR 2,000-5,000/month ($25-60)
- **Pain:** Missed calls during procedures, after-hours, lunch breaks. Patients call another clinic.
- **Success in 30 days:** "I'm not missing patient calls anymore. I see who called, what they needed, and appointments are booked automatically."

---

## MVP Scope (Final)

### IN SCOPE (v1)

| Feature | Reason |
|---|---|
| Inbound call answering (Hindi + English) | Core value proposition |
| Patient info capture (name, phone, reason) | Minimum viable lead data |
| Appointment booking (Google Calendar) | What makes this a "receptionist" not an "answering machine" |
| WhatsApp notification to clinic after each call | How Indian businesses communicate -- non-negotiable |
| Call recording + transcript (all plans) | Trust mechanism, quality verification, compliance |
| Basic dashboard (call log, leads, read-only settings) | Clinic owner's daily "what happened" view |
| Manual onboarding by Scalyft team | Learn what clinics need before building self-serve |
| Emergency call transfer to clinic number | Patient safety -- severe pain/trauma gets a human |

### OUT OF SCOPE (v2+)

| Feature | Reason |
|---|---|
| Self-serve onboarding wizard | Manual setup teaches you what clinics need. Build after 10-15 onboardings. |
| Regional languages (Tamil, Telugu, Marathi) | Hindi + English covers 70%+ urban. Regional adds timeline-killing complexity. |
| Practice management integrations (Clove, etc.) | Fragmented market. Google Calendar is the common denominator. |
| Outbound calls (reminders, follow-ups) | Inbound is the core problem. Outbound is a feature. |
| Multi-location support | One clinic per account. Chain clinics are v2. |
| Analytics/reporting | Basic call log is enough. |
| Billing system | Use Razorpay links or bank transfer for first customers. |
| Patient records/history | Orvia is not a PMS. Don't become one. |
| SMS notifications | WhatsApp covers India. SMS is redundant. |
| Settings self-edit | Settings page is read-only in v1. Clinics contact Scalyft to change config. Avoids building Vapi API update logic for MVP. |
| Dashboard search/filters | Simple paginated list sorted by most recent. Add when clinics ask for it. |
| Custom audio player | Link to Vapi recording URL. No custom player for MVP. |

---

## Positioning

### One-Liner

**"Orvia is your clinic's AI receptionist -- answers every patient call in Hindi or English, captures their details, and books appointments, so your front desk can focus on patients in the chair."**

### Against the Status Quo (Real Competition)

| Status Quo | Orvia's Pitch |
|---|---|
| "My receptionist handles it" | "What about during procedures, lunch, or after 6 PM?" |
| "Patients WhatsApp us" | "How many WhatsApp messages go unanswered for hours?" |
| "We don't miss many calls" | "14-day pilot will show you exactly how many you miss." |
| "AI can't handle dental patients" | "Call this number and try it yourself." |

### Long-Term Vision

India dental is Phase 1 -- the training ground. Phase 2 (6-12 months) is US home services (HVAC/plumbing), where willingness to pay is 5-10x higher and the same product architecture scales directly. The experience, sales skills, and operational maturity built in India become the competitive advantage in the US market.

---

## Core Workflow Map

### Happy Path: Patient Calls Clinic

```
1. Patient dials clinic number
2. Call forwards to Orvia's Vapi number
3. Vapi -> POST /api/vapi/assistant-request (Vercel)
   -> Lookup clinic WHERE vapi_phone_id = request.message.call.phoneNumberId
   -> Return assistant config (greeting, language, tools, calendar)
4. Vapi fires call.started webhook -> n8n creates call record in Supabase
   (This establishes the vapi_call_id -> clinic_id mapping for mid-call tools)
5. AI answers in Hindi or English:
   "Namaste! [Clinic] mein aapka swagat hai. Main Orvia hoon."
6. AI determines patient need:
   - New appointment -> booking flow
   - Reschedule -> booking flow
   - Clinic info -> answers from config
   - Emergency -> immediate transfer
7a. BOOKING FLOW:
   -> AI calls n8n: check_availability (n8n resolves clinic_id from vapi_call_id in headers)
   -> n8n queries Google Calendar -> returns { available_slots: ["10:00 AM", "2:30 PM"] }
   -> AI offers slots, patient picks one
   -> AI calls n8n: book_appointment
   -> n8n creates Calendar event + Supabase appointment record
   -> n8n sends WhatsApp to clinic owner with appointment details
   -> AI confirms: "Aapka appointment book ho gaya hai"
7b. LEAD CAPTURE FLOW:
   -> AI calls n8n: capture_lead (n8n resolves clinic_id from vapi_call_id)
   -> n8n inserts into Supabase leads table
   -> n8n sends WhatsApp to clinic owner
   -> AI: "Clinic aapko jaldi call karegi"
8. Call ends -> Vapi sends call.ended webhook -> n8n
   -> Store transcript + recording URL in Supabase calls table
   -> Supabase Realtime pushes update to dashboard
9. Clinic owner sees call + lead/appointment in dashboard + WhatsApp
```

### Failure States

| Failure | Behavior |
|---|---|
| n8n down | AI says "Clinic will call you back within 30 minutes." Caller's phone number is captured from PSTN caller ID by Vapi and included in the call.ended payload when n8n recovers. |
| Google Calendar API fails | AI captures all info as lead, notifies clinic via WhatsApp: "Manual booking needed for [patient name]." |
| Unsupported language | AI detects non-Hindi/English, says in Hindi: "Ek minute, main aapko clinic staff se connect karti hoon" -> transfers to clinic number. |
| Emergency/severe pain | Immediate transfer to clinic's emergency number. No AI handling beyond initial triage. |
| Vendor/salesperson | AI takes message, tags as "non-patient." Doesn't waste clinic's time with notifications. |
| Vapi down | Call forwarding falls through to clinic's original number (configured as failsafe in phone forwarding rules). |

**Note on caller phone number:** The patient's phone number is captured automatically from PSTN caller ID metadata by Vapi -- the AI does NOT need to ask for it verbally. The AI asks for the patient's name and service need. If the caller is calling on behalf of someone else, the AI asks for the patient's contact number.

---

## Technical Architecture Plan

### Component Map

```
PATIENTS (Phone) -> PSTN -> VAPI (Deepgram STT + GPT-4o-mini + ElevenLabs TTS)
                              |
                 +------------+------------+
                 |                         |
         [assistant-request]        [function-call / call events]
                 |                         |
                 v                         v
              VERCEL                      n8n (Railway.app)
         /api/vapi/webhook          Webhook workflows:
         (clinic lookup,             - call_started (create call record)
          return config)             - capture_lead
                 |                   - check_availability
                 |                   - book_appointment
                 |                   - call_ended (store + notify)
                 |                         |
                 +------------+------------+
                              |
                              v
                         SUPABASE
                    (PostgreSQL + Auth + Realtime)
                    Tables: clinics, users, calls, leads, appointments
                    RLS: each clinic sees only its own data
                              |
                              v
                    VERCEL (Next.js Dashboard)
                    Pages: /dashboard, /calls, /calls/[id], /settings
                    Connected via Supabase Realtime for live updates
                              |
                              v
                    CLINIC OWNERS (Browser/Mobile)
```

### Authentication Flow

**Dashboard auth:** Email + password via Supabase Auth. During manual onboarding, Scalyft creates the user account in Supabase Auth and sends the clinic owner a password-reset link to set their password. No OAuth, no magic links for v1.

**RLS enforcement:** Every table policy checks `clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())`. Frontend uses the Supabase anon key + user JWT. n8n and server-side API routes use the `service_role` key (bypasses RLS).

**Account creation flow (manual onboarding):**
1. Scalyft creates a `clinics` row via Supabase dashboard or admin script
2. Scalyft creates a Supabase Auth user with the clinic owner's email
3. Links the user to the clinic in the `users` table
4. Sends password-reset email -> clinic owner sets password -> logs in to dashboard

### Google Calendar Integration

**Approach: Scalyft-owned service account with shared calendars.**

During onboarding, Scalyft creates a Google Calendar for the clinic (e.g., "Dr. Sharma's Dental - Appointments") using the service account. The calendar is shared with the clinic owner's Google account so they see it in their own Google Calendar app. The `calendar_id` is stored in `clinics.settings.calendar_id`.

This avoids per-clinic OAuth consent flows, token refresh logic, and revocation handling. The trade-off: Scalyft owns the calendar data. Acceptable for MVP with manual onboarding.

### WhatsApp Business API Setup

**Timeline risk: Meta Business verification takes 1-7 business days.** Start this on day one of the project.

Requirements:
1. Meta Business Manager account (create at business.facebook.com)
2. Business verification (documents: GST certificate or incorporation docs)
3. WhatsApp Business API access via a BSP (Business Solution Provider) -- recommend **Twilio** (already in Vapi's ecosystem) or **Gupshup** (strong in India, cheaper)
4. A dedicated phone number for sending WhatsApp notifications
5. Approved message templates for proactive notifications (e.g., "New appointment booked: {{patient_name}} on {{date}} at {{time}}")

**Fallback if WhatsApp API is not approved in time:** Use a simple WhatsApp Web automation library (`whatsapp-web.js`) for the pilot phase. Migrate to official API once approved. This is hacky but unblocks the pilot.

### Data Model

**5 tables, all with Row Level Security:**

**clinics** -- id (UUID PK), name (TEXT), slug (TEXT UNIQUE), phone_display (TEXT), vapi_phone_id (TEXT), vapi_assistant_id (TEXT), timezone (TEXT, default 'Asia/Kolkata'), settings (JSONB: greeting, hours, services, languages, emergency_number, calendar_id, transfer_number), status (TEXT: active/inactive/onboarding), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ)

**users** -- id (UUID PK -> Supabase Auth), clinic_id (UUID FK -> clinics), email (TEXT), full_name (TEXT), role (TEXT: owner/admin/staff), created_at (TIMESTAMPTZ)

**calls** -- id (UUID PK), clinic_id (UUID FK -> clinics), vapi_call_id (TEXT UNIQUE -- dedup key), caller_phone (TEXT -- from PSTN caller ID), language_detected (TEXT: hi/en), status (TEXT: in_progress/completed/missed/failed/transferred), started_at (TIMESTAMPTZ), ended_at (TIMESTAMPTZ), duration_secs (INTEGER), transcript (JSONB -- array of {role, content, timestamp} turns), summary (TEXT -- AI-generated), recording_url (TEXT), extracted_data (JSONB), outcome (TEXT: appointment_booked/lead_captured/info_given/transferred), cost_cents (INTEGER), created_at (TIMESTAMPTZ)

**leads** -- id (UUID PK), clinic_id (UUID FK -> clinics), call_id (UUID FK -> calls), name (TEXT), phone (TEXT), email (TEXT), service_needed (TEXT), urgency (TEXT: emergency/urgent/routine/inquiry), notes (TEXT), status (TEXT: new/contacted/booked/closed/lost), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ)

**appointments** -- id (UUID PK), clinic_id (UUID FK -> clinics), lead_id (UUID FK -> leads), call_id (UUID FK -> calls), patient_name (TEXT), patient_phone (TEXT), service_type (TEXT), scheduled_start (TIMESTAMPTZ), scheduled_end (TIMESTAMPTZ), notes (TEXT), status (TEXT: confirmed/cancelled/completed/no_show/rescheduled), google_cal_event_id (TEXT), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ)

### API Contracts

**Vapi -> Vercel: Assistant Request**

```
POST /api/vapi/assistant-request
Incoming payload from Vapi:
{
  "message": {
    "type": "assistant-request",
    "call": {
      "id": "call_abc123",
      "phoneNumberId": "pn_xyz789"    // Maps to clinics.vapi_phone_id
    }
  }
}

Vercel handler:
1. Extract phoneNumberId from request body
2. Query Supabase: SELECT * FROM clinics WHERE vapi_phone_id = phoneNumberId
3. Build and return assistant config JSON (model, voice, tools, firstMessage)

Response: full Vapi assistant config object (see Appendix)
```

**Vapi -> n8n: Call Started (creates call record)**

```
POST /webhook/call-started
Headers: x-webhook-secret: {{N8N_WEBHOOK_SECRET}}
Body (from Vapi): { call_id: "call_abc123", phone_number_id: "pn_xyz789", customer_number: "+919876543210" }
n8n action:
1. Lookup clinic_id from phone_number_id
2. INSERT into calls table: { vapi_call_id, clinic_id, caller_phone, status: 'in_progress', started_at: now() }
Response: { success: true }
```

**Vapi -> n8n: Function Calls (mid-call)**

All mid-call function calls include Vapi's call ID. n8n resolves clinic_id by looking up the call record created in call-started.

```
POST /webhook/capture-lead
Headers: x-webhook-secret: {{N8N_WEBHOOK_SECRET}}
Body: {
  "message": {
    "call": { "id": "call_abc123" },
    "functionCall": {
      "name": "capture_lead",
      "parameters": { "name": "Rahul Sharma", "phone": "+919876543210", "service_needed": "tooth pain", "urgency": "urgent", "notes": "Pain since 2 days" }
    }
  }
}
n8n action:
1. Lookup call record by vapi_call_id -> get clinic_id and call.id
2. INSERT into leads: { clinic_id, call_id, name, phone, service_needed, urgency, notes }
3. Send WhatsApp to clinic owner: "New patient: Rahul Sharma, tooth pain (urgent). Phone: +919876543210"
Response: { "result": "Lead captured. Clinic team has been notified and will call you back shortly." }

POST /webhook/check-availability
Headers: x-webhook-secret: {{N8N_WEBHOOK_SECRET}}
Body: { "message": { "call": { "id": "call_abc123" }, "functionCall": { "name": "check_availability", "parameters": { "date": "2026-03-22", "service_type": "cleaning" } } } }
n8n action:
1. Lookup clinic_id from call record
2. Query Google Calendar for available slots on that date
Response: { "result": "Available slots: 10:00 AM, 2:30 PM, 4:00 PM" }

POST /webhook/book-appointment
Headers: x-webhook-secret: {{N8N_WEBHOOK_SECRET}}
Body: { "message": { "call": { "id": "call_abc123" }, "functionCall": { "name": "book_appointment", "parameters": { "patient_name": "Rahul Sharma", "patient_phone": "+919876543210", "service_type": "cleaning", "slot": "2026-03-22T14:30:00+05:30" } } } }
n8n action:
1. Lookup clinic_id from call record
2. Create Google Calendar event
3. INSERT into appointments: { clinic_id, call_id, patient_name, patient_phone, service_type, scheduled_start, status: 'confirmed', google_cal_event_id }
4. Send WhatsApp to clinic owner: "Appointment booked: Rahul Sharma, cleaning, March 22 at 2:30 PM"
Response: { "result": "Appointment confirmed for March 22 at 2:30 PM. The clinic will see you then." }
```

**Vapi -> n8n: Call Ended (post-call processing)**

```
POST /webhook/call-ended
Headers: x-webhook-secret: {{N8N_WEBHOOK_SECRET}}
Body: {
  "message": {
    "call": { "id": "call_abc123" },
    "transcript": [ { "role": "assistant", "content": "Namaste!..." }, { "role": "user", "content": "..." } ],
    "recordingUrl": "https://...",
    "summary": "Patient called about tooth pain...",
    "endedReason": "customer-ended-call"
  }
}
n8n action:
1. UPDATE calls SET transcript, recording_url, summary, status='completed', ended_at, duration_secs
2. Supabase Realtime auto-pushes the update to connected dashboard clients
Response: { success: true }
```

**Webhook Security:** All n8n webhooks validate `x-webhook-secret` header against `N8N_WEBHOOK_SECRET` env var. Vapi tool calls include this secret via the `server.secret` field in the assistant config. Requests without a valid secret are rejected with 401.

**Dashboard -> Supabase:**
Direct client with RLS. No custom API routes for reads. Realtime subscriptions for live call/lead updates.

### Environment Variables

```
# Vercel / Next.js
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Server-side only, never expose to client
VAPI_API_KEY=
VAPI_WEBHOOK_SECRET=

# n8n (Railway)
N8N_WEBHOOK_SECRET=                 # Shared secret for webhook auth
N8N_SUPABASE_URL=
N8N_SUPABASE_SERVICE_KEY=           # Service role for RLS bypass
GOOGLE_CALENDAR_SERVICE_ACCOUNT=    # Service account JSON (base64 encoded)
WHATSAPP_API_TOKEN=                 # WhatsApp Business API or Gupshup token
WHATSAPP_PHONE_ID=
WHATSAPP_BUSINESS_ID=
```

### Infrastructure Costs (MVP)

| Service | Monthly Cost |
|---|---|
| Vapi (pay-as-you-go, ~500-1500 min) | $18-48 |
| OpenAI GPT-4o-mini | $5-12 |
| n8n on Railway | $5-10 |
| Supabase (free tier) | $0 |
| Vercel (free tier) | $0 |
| ElevenLabs (Hindi TTS) | $5-10 |
| WhatsApp Business API (via Gupshup/Twilio) | $6-12 |
| Vapi phone numbers (5-10) | $10-20 |
| UptimeRobot (free) | $0 |
| **Total** | **$49-112/mo** |

At 5 clinics x INR 2,999/mo = INR 14,995 (~$180) revenue vs ~$80 costs. Margins work.

### Top Technical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Indian phone numbers unavailable on Vapi | HIGH | Validate on day 1. Fallback: clinics forward to international Vapi number. |
| n8n downtime = failed mid-call actions | HIGH | Railway auto-restart + UptimeRobot. AI fallback: "clinic will call you back." |
| Voice latency degrades experience | HIGH | GPT-4o-mini only, system prompts <500 tokens, Vapi filler words enabled. |
| WhatsApp Business API approval delays | HIGH | Start application day 1. Fallback: whatsapp-web.js for pilot. |
| Vercel cold starts on assistant-request | MEDIUM | Use Edge Runtime for the webhook route (no cold starts). |
| Hindi STT accuracy with dental terms | MEDIUM | Custom pronunciation guide in system prompt, test with real dental conversations. |
| Multi-tenant routing misconfiguration | MEDIUM | Phone -> clinic mapping in database (not code), log every assistant-request. |
| Cost escalation from unexpected volume | MEDIUM | Per-clinic call tracking, monthly caps, Vapi billing alerts. |
| Data loss on Supabase free tier | MEDIUM | Daily pg_dump to storage bucket. |

---

## Dashboard UX Plan

### Pages (MVP -- 4 pages)

**1. Overview/Home** -- Today's numbers in big cards: Calls Handled, Leads Captured, Appointments Booked. Recent calls list (last 15, sorted by most recent). Simple and glanceable. No "Needs Attention" logic for v1 -- just the call list.

**2. Calls** -- Paginated call log: time, caller phone, duration, AI summary (one line), outcome tag (appointment/lead/info/transfer). Click to open detail. Sorted by most recent. No search, no filters for v1.

**3. Call Detail** (sub-page /calls/[id]) -- AI-generated summary (2-3 sentences). Caller info (phone from caller ID, name if captured). Outcome and extracted data. Full transcript (collapsible, chat-bubble style with AI/Caller labels). Link to Vapi recording URL (opens in new tab -- no custom player). Action buttons: "Call Back" (tel: link), "Mark as Handled."

**4. Settings** (read-only in v1) -- Displays current clinic config: name, hours, services, greeting, emergency number. "Contact Scalyft to update" message. Account section: email, change password link.

**Onboarding: NOT self-serve in v1.** Scalyft team configures each clinic manually via Supabase dashboard + admin scripts.

### UX Principles

1. **"Glance and Go"** -- Every screen useful in <10 seconds. Big numbers, clear status, obvious actions.
2. **"Plain language"** -- Hindi-English mix in UI where appropriate. No jargon.
3. **"Trust through transparency"** -- Show what the AI did. Every call reviewable.
4. **"Mobile-first"** -- Design for phone screens. Clinic owners check between patients.
5. **"Sensible defaults"** -- Pre-fill hours (10am-7pm), services (cleaning, filling, root canal, extraction, braces, cosmetic), greeting.

---

## Go-To-Market Plan

### Pricing

| Plan | Price | Includes |
|---|---|---|
| Starter | INR 2,999/mo (~$36) | 150 calls/mo, Hindi + English, Google Calendar booking, WhatsApp notifications, call recordings |
| Growth | INR 4,999/mo (~$60) | 400 calls/mo, priority support, custom greeting, dedicated onboarding call |

**Call recordings included in all plans** -- required for compliance (TRAI) and trust. Not a paid upsell.

**14-day free pilot** with white-glove setup for first customers. No free tier. Frame: "One missed patient costs INR 2,000-10,000. Orvia costs less than that per month."

### First 10 Customers Strategy

**Primary channel: In-person clinic visits (India's #1 sales channel for SMBs)**
- Visit 5-10 dental clinics in your city
- Show the demo on your phone -- let them call the demo line
- Offer: "Free 14-day pilot. I set everything up. If you don't love it, I remove it myself."
- Dentists talk to other dentists -- 1 happy customer -> 3-5 referrals

**Secondary channels:**
- Dental professional WhatsApp groups (very active in India)
- Indian Dental Association (IDA) local chapter meetups
- Practo-listed clinics (digitally savvy, easier to reach)
- Cold calling clinics after 7 PM -- if they go to voicemail, that's your prospect

**Target cities (start local, expand):**
- Start with your own city (you can visit in person)
- Expand to 2-3 nearby Tier-1/Tier-2 cities via phone/WhatsApp outreach

### Pilot Program

- 14 days, full service, no payment required
- Scalyft configures everything -- clinic owner does nothing
- Monitor every call, fix issues in real-time
- Day 10: send ROI report via WhatsApp -- "Orvia answered X calls you would have missed. Y appointments booked automatically."
- Close: "Continue at INR 2,999/mo? I'll keep everything running."

### Metrics to Track

**Week 1:** Clinics visited, demos given, pilots started, demo line calls received
**Week 4:** Pilots running, calls handled per pilot, pilot-to-paid conversion rate, MRR, call completion rate (>80% target), lead capture rate (>70% target)

**Green lights:** Clinic owners forward more calls to Orvia over time, ask "can it also do X?", recommend to other dentists
**Red lights:** Patients hanging up in <10 seconds, clinics stop forwarding after a few days, >30% of callers say "I want a real person"

---

## Execution Readiness Checklist

- [x] All Phase 1 research is complete and consolidated
- [x] MVP scope is explicitly defined and justified
- [x] Core workflow is fully mapped including edge cases
- [x] Technical architecture is documented (auth, calendar, webhooks, data model)
- [x] ICP is clearly defined (Indian dental clinic owner, Tier-1/Tier-2 cities)
- [x] Go-to-market approach is defined for the first pilot

**Plan complete. Ready for implementation phase.**

---

## Appendix A: Pre-Build Checklist (Priority Order)

**Day 1 blockers (do these FIRST):**
- [ ] Validate Indian phone number availability on Vapi (if unavailable, plan call-forwarding approach)
- [ ] Start WhatsApp Business API application (Meta verification takes 1-7 business days)
- [ ] Create Supabase project (free tier)
- [ ] Create Vapi account, verify credits

**Day 2-3 setup:**
- [ ] Create Vercel project (connect to GitHub repo)
- [ ] Deploy n8n on Railway.app
- [ ] Obtain OpenAI API key (GPT-4o-mini)
- [ ] Set up Google Cloud service account for Calendar API
- [ ] Purchase first Vapi phone number for testing
- [ ] Set up UptimeRobot for n8n health check

**Before first pilot:**
- [ ] Set up subdomain for dashboard (e.g., app.scalyft.tech or app.orvia.in)
- [ ] Test ElevenLabs Hindi voice quality with dental terminology
- [ ] Set up daily Supabase pg_dump backups
- [ ] Create demo clinic ("Dr. Demo's Dental") for prospects to call

## Appendix B: Vapi Assistant Config Template

```json
{
  "name": "Orvia - {{clinic_name}}",
  "model": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "systemPrompt": "You are Orvia, the AI receptionist for {{clinic_name}}. You speak Hindi and English fluently -- match the caller's language. Your job: (1) Greet warmly, (2) Understand what the patient needs, (3) Book an appointment or capture their details, (4) For emergencies (severe pain, swelling, trauma), transfer immediately. Always mention the call is recorded. Clinic hours: {{hours}}. Services: {{services}}. Address: {{address}}.",
    "temperature": 0.3
  },
  "voice": {
    "provider": "11labs",
    "voiceId": "{{hindi_english_voice_id}}"
  },
  "firstMessage": "Namaste! {{clinic_name}} mein aapka swagat hai. Main Orvia hoon, aapki kaise madad kar sakti hoon? Hello and welcome to {{clinic_name}}. I'm Orvia, how can I help you today?",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "capture_lead",
        "description": "Capture the patient's contact information and service need",
        "parameters": {
          "type": "object",
          "properties": {
            "name": { "type": "string", "description": "Patient's full name" },
            "phone": { "type": "string", "description": "Patient's phone number (only if different from caller)" },
            "service_needed": { "type": "string", "description": "What dental service they need" },
            "urgency": { "type": "string", "enum": ["emergency", "urgent", "routine", "inquiry"], "description": "How urgent is the request" },
            "notes": { "type": "string", "description": "Any other relevant details" }
          },
          "required": ["name", "service_needed", "urgency"]
        }
      },
      "server": {
        "url": "https://n8n.railway.app/webhook/capture-lead",
        "secret": "{{N8N_WEBHOOK_SECRET}}"
      }
    },
    {
      "type": "function",
      "function": {
        "name": "check_availability",
        "description": "Check available appointment slots for a given date",
        "parameters": {
          "type": "object",
          "properties": {
            "date": { "type": "string", "description": "Date to check in YYYY-MM-DD format" },
            "service_type": { "type": "string", "description": "Type of dental service" }
          },
          "required": ["date"]
        }
      },
      "server": {
        "url": "https://n8n.railway.app/webhook/check-availability",
        "secret": "{{N8N_WEBHOOK_SECRET}}"
      }
    },
    {
      "type": "function",
      "function": {
        "name": "book_appointment",
        "description": "Book a confirmed appointment for the patient",
        "parameters": {
          "type": "object",
          "properties": {
            "patient_name": { "type": "string" },
            "patient_phone": { "type": "string" },
            "service_type": { "type": "string" },
            "slot": { "type": "string", "description": "ISO 8601 datetime of the appointment" }
          },
          "required": ["patient_name", "patient_phone", "service_type", "slot"]
        }
      },
      "server": {
        "url": "https://n8n.railway.app/webhook/book-appointment",
        "secret": "{{N8N_WEBHOOK_SECRET}}"
      }
    },
    {
      "type": "transferCall",
      "destinations": [
        {
          "type": "number",
          "number": "{{emergency_number}}",
          "message": "Ek minute, main aapko clinic se connect kar rahi hoon."
        }
      ]
    }
  ],
  "endCallPhrases": ["goodbye", "bye", "dhanyavaad", "shukriya", "bas itna hi", "thank you"],
  "serverUrl": "https://n8n.railway.app/webhook/vapi-events"
}
```
