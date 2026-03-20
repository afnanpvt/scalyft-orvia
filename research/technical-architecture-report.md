# Orvia Technical Architecture Report
## AI-Powered Front Desk System for Home Services
### Prepared by: Technical Architect | Date: 2026-03-20

> **Note:** Web search/fetch tools were unavailable during research. All information
> is based on knowledge through early 2025. Items marked with [VERIFY] should be
> confirmed against current documentation before finalizing decisions.

---

## 1. Vapi Assessment

### 1.1 Free Tier Limits [VERIFY against https://vapi.ai/pricing]

As of early 2025, Vapi offered:

| Feature | Free Tier | Notes |
|---|---|---|
| Minutes | ~10 free minutes to start (credit-based) | Consumed across all calls |
| Concurrent calls | 1-2 on free tier | Paid plans increase this |
| Phone numbers | Can purchase via Vapi (~$2/mo per number) | Twilio BYOC also supported |
| Transcription | Included (Deepgram default) | Multiple STT providers available |
| LLM | BYOK (Bring Your Own Key) | You pay OpenAI/Anthropic directly |
| TTS | Multiple providers (11Labs, PlayHT, Deepgram) | Some have per-char costs |
| Webhooks | Full webhook support | All plans |
| API Access | Full REST API | All plans |

**Pricing model:** Vapi charges per-minute for the voice pipeline (STT + orchestration + TTS). The LLM cost is separate (your API key). Typical all-in cost: **$0.05-$0.15/minute** depending on provider choices.

### 1.2 Known Limitations and Gotchas

1. **Latency sensitivity:** Voice AI requires <800ms round-trip. LLM choice matters enormously. GPT-4o-mini or Claude 3 Haiku are recommended over larger models for acceptable latency.

2. **Free tier is a trial, not a production plan.** You will need to move to pay-as-you-go quickly. Budget ~$0.10/min all-in.

3. **Phone number provisioning:** Vapi provisions numbers via Twilio/Vonage under the hood. For US home services, you want local area code numbers. Porting existing numbers is possible but takes days.

4. **Transcript quality:** Background noise (HVAC shops, job sites) degrades STT accuracy. Test with realistic audio conditions.

5. **Call recording compliance:** Some US states require two-party consent. Your assistant greeting MUST disclose recording. This is a legal requirement, not optional.

6. **Structured data extraction is async:** You get the full transcript via webhook after the call, but real-time extraction during the call requires careful prompt engineering of the assistant.

7. **No built-in CRM/calendar:** Vapi is voice infrastructure only. All business logic (booking, lead capture) must be built via tool calls or post-call webhooks.

8. **Rate limits on free tier:** API rate limits may throttle during testing. [VERIFY current limits]

### 1.3 Structured Data Extraction

Vapi supports two approaches:

**A. During the call (Tool Calls / Function Calling):**
- Configure "tools" on the Vapi assistant (same concept as OpenAI function calling)
- The LLM can invoke tools mid-conversation (e.g., `capture_lead`, `book_appointment`)
- Each tool call hits a webhook URL you define (your n8n endpoint)
- The tool can return data back to the conversation

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "capture_lead",
        "description": "Capture caller's contact information",
        "parameters": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "phone": { "type": "string" },
            "service_needed": { "type": "string" },
            "urgency": { "enum": ["emergency", "urgent", "routine"] },
            "address": { "type": "string" }
          },
          "required": ["name", "phone", "service_needed"]
        }
      }
    }
  ]
}
```

**B. After the call (End-of-Call Report / Webhook):**
- Vapi sends a `call.ended` webhook with full transcript
- You can configure an "analysis" schema that Vapi runs post-call
- Returns structured JSON extracted from the conversation
- More reliable than mid-call extraction but not real-time

**Recommendation for Orvia:** Use BOTH. Tool calls for time-sensitive actions (booking), end-of-call analysis for data completeness validation.

### 1.4 Webhook / API Integration Model

Vapi uses an event-driven webhook model:

| Event | When | Use Case |
|---|---|---|
| `assistant-request` | Incoming call | Dynamic assistant config per business |
| `function-call` | LLM invokes a tool | Mid-call actions (book, lookup) |
| `call.started` | Call begins | Log to database |
| `call.ended` | Call completes | Store transcript, trigger workflows |
| `transcript` | Real-time partial | Live dashboard updates (via polling) |
| `hang` | Call transferred/ended | Cleanup |

**Key architectural insight:** The `assistant-request` webhook is critical for multi-tenant. When a call comes in to a Vapi number, Vapi hits your webhook, and you return the assistant configuration dynamically based on which business owns that phone number. This means one Vapi account serves all tenants.

### 1.5 Call Transfer

Vapi supports call transfer via:
- **`transferCall` tool:** Configure as a function tool. When the LLM decides a transfer is needed, it invokes the tool with a destination number.
- **SIP transfer:** For businesses with existing phone systems.
- **Warm vs. cold transfer:** Cold transfer (blind) is straightforward. Warm transfer (with context) requires more configuration.

For home services MVP: Configure transfer to the business owner's cell phone when the AI cannot resolve the caller's issue. The LLM prompt should define clear escalation criteria (e.g., "transfer if the caller reports a gas leak or active flooding").

### 1.6 Alternatives to Vapi

| Platform | Strengths | Weaknesses | Pricing |
|---|---|---|---|
| **Bland.ai** | Simple API, good latency | Less customizable, smaller community | ~$0.09/min |
| **Retell AI** | Low latency, good DX | Newer, less battle-tested | ~$0.07-0.15/min |
| **Vocode** | Open source, self-hostable | Requires more engineering | Infra costs only |
| **Synthflow** | No-code, quick setup | Less flexible for custom logic | Higher per-min |
| **Custom (Twilio + Deepgram + LLM)** | Full control | 3-4x engineering effort | Variable |

**Recommendation:** Start with Vapi. It has the best DX for your timeline. Abstract the voice layer behind an interface in your code so you can swap providers later if needed.

---

## 2. n8n Integration

### 2.1 n8n + Vapi Integration

n8n connects to Vapi via:

1. **Webhook Trigger Node:** n8n exposes webhook URLs that Vapi calls for events (function calls, call ended, etc.)
2. **HTTP Request Node:** n8n calls Vapi's REST API to create/update assistants, phone numbers, etc.
3. **No official Vapi node** exists in n8n's core library [VERIFY]. You'll use generic Webhook + HTTP Request nodes.

**Typical flow:**
```
Vapi (function-call webhook)
  --> n8n Webhook Trigger
    --> Extract parameters
    --> Route by function name (Switch node)
    --> Execute action (Google Calendar API, CRM, DB)
    --> Return response to Vapi
```

### 2.2 Self-Hosted n8n Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Downtime = missed calls** | HIGH | If n8n is down when Vapi sends a webhook, the function call fails silently. The AI assistant will tell the caller it can't complete the action. |
| **No auto-scaling** | MEDIUM | Single n8n instance handles ~50-100 concurrent workflow executions. Fine for MVP. |
| **Data loss on crash** | MEDIUM | Use PostgreSQL backend (not default SQLite). Enable workflow execution logging. |
| **SSL/Domain setup** | LOW | Required for Vapi webhooks. Use Cloudflare Tunnel or similar. |
| **Updates break things** | MEDIUM | Pin n8n version. Test updates in staging. |

**Where to host n8n:**

| Option | Cost | Reliability | Recommendation |
|---|---|---|---|
| Railway.app | ~$5-10/mo | Good, managed | Best for MVP |
| Render.com | ~$7/mo | Good | Good alternative |
| Hetzner VPS | ~$4-5/mo | Manual management | Cheapest |
| n8n Cloud | ~$20/mo | Fully managed | Easiest but pricier |
| Docker on fly.io | ~$5-7/mo | Good | Good middle ground |

**Recommendation:** Use **Railway.app** or **Render.com** for n8n hosting. Not truly "self-hosted" but gives you a managed container with persistent storage at low cost. Avoid running n8n on Vercel -- it needs a persistent process.

### 2.3 Common Workflow Patterns

**Pattern 1: Lead Capture**
```
Vapi function-call: capture_lead({name, phone, service, urgency})
  --> n8n Webhook
  --> Insert into Supabase (leads table)
  --> Send SMS notification to business owner (Twilio)
  --> Send email summary (SendGrid/Resend)
  --> Return confirmation to Vapi ("Got it, we'll call back within 30 minutes")
```

**Pattern 2: Appointment Booking**
```
Vapi function-call: check_availability({date, service_type})
  --> n8n Webhook
  --> Query Google Calendar API
  --> Return available slots to Vapi

Vapi function-call: book_appointment({date, time, name, phone, service})
  --> n8n Webhook
  --> Create Google Calendar event
  --> Insert into Supabase (appointments table)
  --> Send confirmation SMS to caller
  --> Return confirmation to Vapi
```

**Pattern 3: Post-Call Processing**
```
Vapi call.ended webhook
  --> n8n Webhook
  --> Store full transcript in Supabase
  --> Run sentiment analysis (optional)
  --> Update lead status
  --> Trigger follow-up workflow if needed
```

---

## 3. Vercel + Serverless Constraints

### 3.1 Real-Time Dashboard on Vercel

**Can it work? Yes, with caveats.**

Vercel's serverless functions are stateless and short-lived (default 10s timeout, max 60s on Pro, 300s on Enterprise). This affects real-time features:

| Feature | Approach on Vercel |
|---|---|
| Dashboard page loads | Standard Next.js pages -- works perfectly |
| API routes for CRUD | Serverless functions -- works perfectly |
| Webhook receivers (from Vapi/n8n) | Serverless functions -- works perfectly |
| Real-time call status | Polling (every 5-10s) or Supabase Realtime |
| Live transcript streaming | NOT feasible on Vercel directly |
| WebSocket connections | NOT supported on Vercel serverless |

**Solution for real-time:** Use **Supabase Realtime** (built on PostgreSQL LISTEN/NOTIFY). When a webhook writes to the database, Supabase pushes the update to connected dashboard clients via WebSocket. The WebSocket connection is to Supabase, not to Vercel.

### 3.2 Database Recommendation

| Database | Vercel Integration | Free Tier | Strengths | Weaknesses |
|---|---|---|---|---|
| **Supabase** | Excellent (official partner) | 500MB, 2 projects | Postgres + Auth + Realtime + Storage | Can be overkill |
| **Neon** | Excellent (official partner) | 512MB, branching | Serverless Postgres, scales to zero | Less ecosystem |
| **PlanetScale** | Good | Was free, now paid | MySQL, branching | MySQL not Postgres; free tier removed |
| **Turso** | Good | 9GB, 500M rows | SQLite-based, edge-native | Less mature ecosystem |
| **Vercel Postgres** | Native | 256MB | Zero-config | Actually Neon under the hood, limited |

**Recommendation: Supabase.**

Reasons:
1. **Realtime subscriptions** solve your dashboard live-update problem without WebSockets on Vercel
2. **Built-in auth** (Row Level Security) handles multi-tenant isolation
3. **Edge Functions** can serve as a backup webhook receiver if n8n goes down
4. **Storage** for call recordings if needed
5. **Generous free tier** for MVP
6. **PostgreSQL** -- most flexible, best ORM support (Prisma, Drizzle)

### 3.3 WebSocket Limitations

Vercel does NOT support persistent WebSocket connections on serverless functions. Options:

1. **Supabase Realtime** (recommended) -- client connects directly to Supabase
2. **Ably / Pusher** -- managed WebSocket services (~free at low scale)
3. **Server-Sent Events (SSE)** -- works on Vercel with streaming responses, but has timeout limits
4. **Polling** -- simplest, works fine for dashboard refresh every 5-10s

### 3.4 Vercel Cost at Low Scale

| Resource | Free Tier | Pro ($20/mo) |
|---|---|---|
| Serverless Function Invocations | 100K/mo | 1M/mo |
| Bandwidth | 100GB | 1TB |
| Build Minutes | 6000/mo | 24000/mo |
| Edge Function Invocations | 500K/mo | 3M/mo |
| Serverless Execution Time | 100 GB-hours | 1000 GB-hours |

**For MVP (0-50 businesses):** The **free tier** is likely sufficient for the dashboard. Webhook traffic from Vapi goes to n8n, not Vercel. Dashboard usage from 50 businesses is minimal.

---

## 4. Minimal Viable Data Model

### 4.1 Schema Design (PostgreSQL / Supabase)

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- BUSINESSES (tenants)
-- ============================================================
CREATE TABLE businesses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,          -- URL-friendly identifier
    phone_display   TEXT,                          -- Business phone shown to customers
    vapi_phone_id   TEXT,                          -- Vapi phone number resource ID
    vapi_assistant_id TEXT,                        -- Vapi assistant ID for this business
    timezone        TEXT DEFAULT 'America/New_York',
    settings        JSONB DEFAULT '{}',            -- Greeting, hours, services, transfer number, etc.
    status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'onboarding')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS (dashboard access, linked to Supabase Auth)
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id),  -- Supabase Auth user
    business_id     UUID NOT NULL REFERENCES businesses(id),
    email           TEXT NOT NULL,
    full_name       TEXT,
    role            TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'staff')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CALLS
-- ============================================================
CREATE TABLE calls (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id),
    vapi_call_id    TEXT UNIQUE,                   -- Vapi's call ID for deduplication
    caller_phone    TEXT,                          -- Caller's phone number
    direction       TEXT DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
    status          TEXT DEFAULT 'in_progress' CHECK (status IN (
                        'in_progress', 'completed', 'missed', 'failed', 'transferred'
                    )),
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    duration_secs   INTEGER,
    transcript      JSONB,                         -- Full structured transcript
    summary         TEXT,                          -- AI-generated call summary
    sentiment       TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    recording_url   TEXT,
    extracted_data  JSONB DEFAULT '{}',            -- Structured data from Vapi analysis
    cost_cents      INTEGER,                       -- Vapi cost tracking
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LEADS (captured from calls)
-- ============================================================
CREATE TABLE leads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id),
    call_id         UUID REFERENCES calls(id),     -- Which call generated this lead
    name            TEXT,
    phone           TEXT NOT NULL,
    email           TEXT,
    address         TEXT,
    service_needed  TEXT,                          -- "AC repair", "pipe leak", etc.
    urgency         TEXT DEFAULT 'routine' CHECK (urgency IN (
                        'emergency', 'urgent', 'routine', 'inquiry'
                    )),
    notes           TEXT,                          -- Additional context from call
    status          TEXT DEFAULT 'new' CHECK (status IN (
                        'new', 'contacted', 'qualified', 'booked', 'closed', 'lost'
                    )),
    source          TEXT DEFAULT 'phone',          -- 'phone', 'web', 'referral'
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id),
    lead_id         UUID REFERENCES leads(id),
    call_id         UUID REFERENCES calls(id),     -- Which call booked this
    customer_name   TEXT NOT NULL,
    customer_phone  TEXT NOT NULL,
    service_type    TEXT,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end   TIMESTAMPTZ,
    address         TEXT,
    notes           TEXT,
    status          TEXT DEFAULT 'confirmed' CHECK (status IN (
                        'confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled'
                    )),
    external_cal_id TEXT,                          -- Google Calendar event ID
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_calls_business     ON calls(business_id, created_at DESC);
CREATE INDEX idx_calls_vapi_id      ON calls(vapi_call_id);
CREATE INDEX idx_leads_business     ON leads(business_id, created_at DESC);
CREATE INDEX idx_leads_status       ON leads(business_id, status);
CREATE INDEX idx_leads_phone        ON leads(business_id, phone);
CREATE INDEX idx_appointments_biz   ON appointments(business_id, scheduled_start);
CREATE INDEX idx_users_business     ON users(business_id);

-- ============================================================
-- ROW LEVEL SECURITY (multi-tenant isolation)
-- ============================================================
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can only see their own business's data
CREATE POLICY "Users see own business" ON calls
    FOR ALL USING (
        business_id IN (
            SELECT business_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users see own business" ON leads
    FOR ALL USING (
        business_id IN (
            SELECT business_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users see own business" ON appointments
    FOR ALL USING (
        business_id IN (
            SELECT business_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users see own business" ON businesses
    FOR ALL USING (
        id IN (
            SELECT business_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users see own record" ON users
    FOR ALL USING (id = auth.uid());

-- ============================================================
-- SERVICE ROLE BYPASS (for n8n/webhook writes)
-- ============================================================
-- Supabase service_role key bypasses RLS.
-- Use service_role key ONLY in n8n and server-side API routes.
-- Use anon key + user JWT in the frontend dashboard.
```

### 4.2 Schema Notes

- **5 tables total.** This is intentionally minimal. Resist adding tables until you need them.
- **JSONB fields** (`settings`, `extracted_data`, `transcript`) provide flexibility without schema migrations. Store business-specific config (hours, services offered, greeting script) in `businesses.settings`.
- **Multi-tenancy via RLS.** Every row is scoped to a `business_id`. Supabase RLS enforces this at the database level -- even a bug in your app code cannot leak data across tenants.
- **`vapi_call_id`** is the deduplication key. Vapi may send duplicate webhooks; always upsert on this field.
- **Soft relationships:** `leads.call_id` and `appointments.call_id` link back to the originating call, enabling the "call -> lead -> appointment" funnel view.

---

## 5. Technical Risks

### Risk 1: n8n Downtime Causes Missed Call Actions
- **Severity:** HIGH
- **Scenario:** n8n goes down. Vapi sends a function-call webhook. No response. The AI tells the caller "I'm sorry, I can't book that right now."
- **Mitigation:**
  - Deploy n8n on a platform with health checks and auto-restart (Railway, Render)
  - Implement a fallback: Vapi assistant prompt should say "I'll have someone call you back within 30 minutes" when a tool call fails
  - Set up uptime monitoring (UptimeRobot, free tier) on the n8n webhook URL
  - Consider Supabase Edge Functions as a hot-standby webhook receiver for critical paths (lead capture)

### Risk 2: Voice Latency Degrades User Experience
- **Severity:** HIGH
- **Scenario:** Caller experiences >2 second pauses. They hang up or get frustrated. Home service callers are often in urgent situations.
- **Mitigation:**
  - Use GPT-4o-mini or Claude 3 Haiku (NOT GPT-4 or Claude Opus) for the voice assistant
  - Keep system prompts concise (<500 tokens)
  - Minimize tool calls during conversation (each adds 1-3s latency)
  - Test with real phone calls, not just the Vapi playground
  - Configure Vapi's "filler words" / "backchanneling" to cover processing gaps

### Risk 3: Multi-Tenant Routing Misconfiguration
- **Severity:** MEDIUM
- **Scenario:** Call comes in, `assistant-request` webhook returns the wrong business's assistant config. Caller gets the wrong greeting, wrong business name.
- **Mitigation:**
  - Map phone numbers to businesses in your database, not in code
  - Log every `assistant-request` with the resolved business_id
  - Test with multiple phone numbers before onboarding real businesses
  - Use Vapi's `assistant-request` webhook (dynamic) rather than static assistant assignment

### Risk 4: Cost Escalation from Unexpected Call Volume
- **Severity:** MEDIUM
- **Scenario:** A business gets 500 calls/month instead of expected 50. Monthly Vapi bill hits $500+ for one customer.
- **Mitigation:**
  - Implement per-business call tracking and monthly caps in your system
  - Set up billing alerts in Vapi dashboard
  - Price your product with per-minute overages (pass costs through)
  - Dashboard should show real-time usage per business

### Risk 5: Scope Creep Delays MVP Launch
- **Severity:** HIGH
- **Scenario:** You try to build appointment booking, CRM sync, SMS follow-ups, analytics, and custom voice selection all before launch.
- **Mitigation:**
  - MVP scope: Lead capture + call logging + owner notification. That's it.
  - Appointment booking is Phase 2
  - CRM integration is Phase 3
  - Define "done" for MVP: A business owner gets an SMS + email when someone calls, with the caller's name, phone, service needed, and urgency level
  - Ship to 3 businesses in Week 3, iterate from there

---

## 6. Infrastructure Cost Estimate

### MVP Scale: 0-50 Businesses, ~10-50 calls/business/month

| Service | Tier | Monthly Cost | Notes |
|---|---|---|---|
| **Vapi** | Pay-as-you-go | $25-250 | 500-2500 min @ ~$0.10/min |
| **LLM (OpenAI)** | GPT-4o-mini | $5-25 | ~$0.01-0.02 per call |
| **n8n hosting** | Railway/Render | $5-10 | Single container |
| **Supabase** | Free tier | $0 | 500MB, 50K auth users |
| **Vercel** | Free/Pro | $0-20 | Free tier likely sufficient |
| **Vapi phone numbers** | Per number | $50-100 | $2/mo x 25-50 numbers |
| **Twilio SMS** (notifications) | Pay-as-go | $5-20 | $0.0079/SMS |
| **Domain (scalyft.tech)** | Annual | ~$1/mo | Already owned |
| **Resend/SendGrid** (email) | Free tier | $0 | 100 emails/day free |
| **UptimeRobot** (monitoring) | Free tier | $0 | 50 monitors |

### Monthly Total by Scale

| Scale | Businesses | Calls/mo | Est. Monthly Cost |
|---|---|---|---|
| Pre-launch (testing) | 0-3 | <100 | **$15-30** |
| Early MVP | 5-10 | 100-500 | **$50-120** |
| Growing MVP | 10-25 | 500-1500 | **$120-300** |
| Scaling | 25-50 | 1500-2500 | **$250-500** |

**Key insight:** The dominant cost is Vapi per-minute charges. Everything else is nearly free at MVP scale. Price your product to cover Vapi costs + margin from day one.

**Suggested pricing model:** $99-199/mo per business (includes X minutes) + $0.15/min overage. This covers costs at ~50 calls/business/month and provides healthy margin.

---

## 7. Recommended Architecture

### 7.1 Component Diagram

```
                    CALLERS (Phone)
                         |
                         | PSTN / SIP
                         v
                  +-------------+
                  |    VAPI     |
                  |  (Voice AI) |
                  |-------------|
                  | - STT       |
                  | - LLM       |
                  | - TTS       |
                  | - Recording |
                  +------+------+
                         |
            +------------+------------+
            |                         |
    [function-call]           [call.ended]
    [assistant-request]       [call.started]
            |                         |
            v                         v
    +-------+-------+        +-------+-------+
    |      n8n      |        |      n8n      |
    | (Live Actions)|        | (Post-Call)   |
    |---------------|        |---------------|
    | - Book appt   |        | - Store call  |
    | - Check avail |        | - Update lead |
    | - Capture lead|        | - Notify owner|
    | - Transfer    |        | - Analytics   |
    +-------+-------+        +-------+-------+
            |                         |
            +------------+------------+
                         |
                         v
              +----------+----------+
              |      SUPABASE       |
              |    (PostgreSQL)     |
              |---------------------|
              | - businesses        |
              | - calls             |
              | - leads             |
              | - appointments      |
              | - users             |
              |---------------------|
              | + Auth (JWT/RLS)    |
              | + Realtime (WS)     |
              | + Storage (files)   |
              +----------+----------+
                         |
              +----------+----------+
              |   Supabase Realtime |
              |   (WebSocket Push)  |
              +----------+----------+
                         |
                         v
              +----------+----------+
              |    VERCEL           |
              |  (Next.js App)      |
              |---------------------|
              | Dashboard:          |
              | - Call history      |
              | - Lead management   |
              | - Live call status  |
              | - Business settings |
              | - Usage / billing   |
              |---------------------|
              | API Routes:         |
              | - /api/vapi/webhook |
              |   (assistant-req)   |
              | - /api/business/*   |
              | - /api/leads/*      |
              +----------+----------+
                         |
                         v
                  BUSINESS OWNERS
                  (Browser / Mobile)
```

### 7.2 Data Flow: Incoming Call (Happy Path)

```
1. Caller dials business number (provisioned via Vapi)
         |
2. Vapi sends POST to Vercel: /api/vapi/assistant-request
   Body: { phone_number_id: "xxx" }
         |
3. Vercel API route looks up business by vapi_phone_id in Supabase
   Returns: assistant config (name, greeting, system prompt, tools, transfer number)
         |
4. Vapi starts conversation using returned config
   AI: "Thanks for calling Johnson HVAC, this is Orvia. How can I help?"
         |
5. Caller: "My AC stopped working, it's 95 degrees"
         |
6. LLM determines: urgent service request -> invoke capture_lead tool
         |
7. Vapi sends POST to n8n: function-call webhook
   Body: { name: "Sarah", phone: "+1555...", service: "AC repair", urgency: "urgent" }
         |
8. n8n workflow:
   a. INSERT into Supabase leads table
   b. Send SMS to business owner: "URGENT: Sarah needs AC repair. Call +1555..."
   c. Send email with full details
   d. Return to Vapi: { result: "Lead captured, owner notified" }
         |
9. AI: "I've notified the Johnson HVAC team about your AC emergency.
        Someone will call you back within 30 minutes. Is there anything else?"
         |
10. Call ends. Vapi sends call.ended webhook to n8n.
          |
11. n8n stores full transcript + call metadata in Supabase calls table.
          |
12. Supabase Realtime pushes update to dashboard.
    Business owner sees new call + lead appear in real-time.
```

### 7.3 Key Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | Supabase (Postgres) | Auth + Realtime + RLS = multi-tenant out of the box |
| Webhook receiver | n8n (primary), Vercel (assistant-request only) | n8n handles complex workflows; Vercel handles fast lookups |
| Real-time updates | Supabase Realtime | Avoids WebSocket limitations on Vercel |
| Frontend | Next.js on Vercel | Fast to build, good DX, free hosting |
| ORM | Drizzle or Prisma | Type-safe DB access in Next.js |
| LLM for voice | GPT-4o-mini | Best latency/cost/quality ratio for voice |
| SMS notifications | Twilio | Already in Vapi's ecosystem |
| Email notifications | Resend | Simple API, generous free tier, built for developers |
| n8n hosting | Railway.app | Cheap, reliable, auto-deploy |
| Monitoring | UptimeRobot | Free, monitors n8n webhook uptime |

### 7.4 Critical Path for 2-3 Week MVP

**Week 1: Foundation**
- Day 1-2: Supabase project + schema + RLS policies
- Day 2-3: Next.js project on Vercel, Supabase auth integration
- Day 3-4: Vapi account, first assistant, test call in playground
- Day 5: n8n deployment on Railway, basic webhook receiver

**Week 2: Integration**
- Day 1-2: `assistant-request` webhook (Vercel API route)
- Day 2-3: `capture_lead` function call workflow (n8n -> Supabase)
- Day 3-4: `call.ended` workflow (transcript storage, owner notification)
- Day 5: Dashboard: call list + lead list (read-only views)

**Week 3: Polish + Launch**
- Day 1-2: Dashboard: lead status management, business settings page
- Day 3: Phone number provisioning flow (admin)
- Day 4: Testing with 2-3 real businesses
- Day 5: Bug fixes, deploy, onboard first paying customer

---

## Appendix A: Environment Variables

```env
# Vercel / Next.js
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # Server-side only, never expose
VAPI_API_KEY=sk-...
VAPI_WEBHOOK_SECRET=whsec_...              # Verify webhook signatures

# n8n
N8N_SUPABASE_URL=https://xxx.supabase.co
N8N_SUPABASE_SERVICE_KEY=eyJ...            # Service role for RLS bypass
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
RESEND_API_KEY=re_...
```

## Appendix B: Vapi Assistant Config Template

```json
{
  "name": "Orvia - {{business_name}}",
  "model": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "systemPrompt": "You are Orvia, the AI receptionist for {{business_name}}, a {{business_type}} company. Your job is to: 1) Greet callers warmly, 2) Understand what service they need, 3) Capture their contact information using the capture_lead tool, 4) For emergencies, transfer to {{transfer_number}} using the transferCall tool. Always mention that the call is being recorded. Business hours: {{hours}}. Services offered: {{services}}.",
    "temperature": 0.3
  },
  "voice": {
    "provider": "11labs",
    "voiceId": "rachel"
  },
  "firstMessage": "Thanks for calling {{business_name}}, this is Orvia. I'd be happy to help you. Just so you know, this call may be recorded for quality purposes. What can I help you with today?",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "capture_lead",
        "description": "Capture the caller's information when they need a service",
        "parameters": {
          "type": "object",
          "properties": {
            "name": { "type": "string", "description": "Caller's full name" },
            "phone": { "type": "string", "description": "Caller's phone number" },
            "service_needed": { "type": "string", "description": "What service they need" },
            "urgency": {
              "type": "string",
              "enum": ["emergency", "urgent", "routine", "inquiry"],
              "description": "How urgent is the request"
            },
            "address": { "type": "string", "description": "Service address if provided" },
            "notes": { "type": "string", "description": "Any other relevant details" }
          },
          "required": ["name", "phone", "service_needed", "urgency"]
        }
      },
      "server": {
        "url": "https://your-n8n.railway.app/webhook/vapi-function-call"
      }
    },
    {
      "type": "transferCall",
      "destinations": [
        {
          "type": "number",
          "number": "{{transfer_number}}",
          "message": "Let me connect you with someone who can help right away."
        }
      ]
    }
  ],
  "endCallPhrases": ["goodbye", "bye", "that's all", "nothing else"],
  "serverUrl": "https://your-n8n.railway.app/webhook/vapi-events"
}
```

## Appendix C: Checklist Before Building

- [ ] Create Vapi account, verify free credits [VERIFY current amount]
- [ ] Create Supabase project (free tier)
- [ ] Create Vercel project (connect to GitHub repo)
- [ ] Deploy n8n on Railway.app
- [ ] Obtain OpenAI API key (for GPT-4o-mini)
- [ ] Obtain Twilio account (for SMS notifications)
- [ ] Purchase first Vapi phone number for testing
- [ ] Set up UptimeRobot for n8n health check
- [ ] Register scalyft.tech subdomain for the dashboard (e.g., app.scalyft.tech)
- [ ] Set up Resend for transactional email
