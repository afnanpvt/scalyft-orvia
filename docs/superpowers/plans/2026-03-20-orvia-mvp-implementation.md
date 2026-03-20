# Orvia MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Orvia, an AI receptionist for Indian dental clinics that answers calls in Hindi/English, captures leads, books appointments into Google Calendar, and notifies clinic owners via WhatsApp.

**Architecture:** Next.js 14 (App Router) on Vercel as the dashboard + Vapi webhook receiver. Supabase for Postgres database, auth, and realtime subscriptions. n8n on Railway for workflow automation (lead capture, appointment booking, WhatsApp notifications). Vapi handles voice AI with GPT-4o-mini + ElevenLabs Hindi TTS.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Supabase (Postgres + Auth + Realtime), Tailwind CSS, shadcn/ui, Vapi (voice AI), n8n (workflow automation), Google Calendar API, WhatsApp Business API

**Spec:** `docs/superpowers/specs/2026-03-20-orvia-research-strategic-plan.md`

---

## File Structure

```
orvia/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout with Supabase provider
│   │   ├── page.tsx                      # Landing/redirect to dashboard or login
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx            # Email+password login
│   │   │   └── reset-password/page.tsx   # Password reset flow
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                # Dashboard shell (nav, auth guard)
│   │   │   ├── page.tsx                  # Overview/Home page
│   │   │   ├── calls/
│   │   │   │   ├── page.tsx              # Call log (paginated list)
│   │   │   │   └── [id]/page.tsx         # Call detail view
│   │   │   └── settings/page.tsx         # Read-only settings display
│   │   └── api/
│   │       └── vapi/
│   │           └── assistant-request/
│   │               └── route.ts          # Vapi assistant-request webhook (Edge Runtime)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                 # Browser Supabase client
│   │   │   ├── server.ts                 # Server-side Supabase client
│   │   │   └── middleware.ts             # Auth middleware for route protection
│   │   ├── vapi/
│   │   │   └── build-assistant-config.ts # Builds Vapi assistant JSON from clinic data
│   │   └── types.ts                      # Shared TypeScript types (Clinic, Call, Lead, etc.)
│   ├── components/
│   │   ├── ui/                           # shadcn/ui components (auto-generated)
│   │   ├── call-list.tsx                 # Reusable call list component
│   │   ├── call-detail.tsx               # Call detail view component
│   │   ├── stat-card.tsx                 # Dashboard stat card
│   │   └── nav.tsx                       # Dashboard navigation
│   └── middleware.ts                     # Next.js middleware (auth redirect)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql        # Full schema: clinics, users, calls, leads, appointments + RLS
├── tests/
│   ├── lib/
│   │   └── vapi/
│   │       └── build-assistant-config.test.ts
│   └── api/
│       └── vapi/
│           └── assistant-request.test.ts  # Tests for the webhook route
├── scripts/
│   ├── seed-demo-clinic.ts               # Seeds a demo clinic for testing
│   └── create-clinic.ts                  # Admin script to onboard a new clinic
├── .env.local.example                    # Template for environment variables
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── README.md
```

---

## Phase 0: Pre-Validation (BEFORE any code)

### Task 0: Validate Day-One Blockers

- [ ] **Step 1: Validate Indian phone numbers on Vapi**

Log into your Vapi dashboard. Go to Phone Numbers -> Buy Number. Check if Indian (+91) numbers are available. If NOT available:
- Fallback plan: Clinics forward their existing number to a US/UK Vapi number. This adds ~200-500ms latency but works.
- Document which approach you're using before proceeding.

- [ ] **Step 2: Start WhatsApp Business API application**

This takes 1-7 business days for Meta verification. Start NOW.

1. Go to business.facebook.com -> Create a Meta Business Manager account
2. Go to developers.facebook.com -> Create an app -> Select "Business" type
3. Add "WhatsApp" product to the app
4. Start business verification (upload GST certificate or incorporation docs)
5. While waiting for approval, proceed with the whatsapp-web.js fallback for pilot

Alternative: Use **Gupshup** (India-focused BSP) instead of Meta's direct API -- faster approval, better India support. Sign up at gupshup.io.

- [ ] **Step 3: Create Google Cloud service account for Calendar API**

1. Go to console.cloud.google.com -> Create new project "Orvia"
2. Enable "Google Calendar API" in APIs & Services
3. Create a Service Account: IAM & Admin -> Service Accounts -> Create
4. Download the JSON key file
5. Base64 encode it: `cat service-account.json | base64` -- this becomes `GOOGLE_CALENDAR_SERVICE_ACCOUNT` env var
6. In the service account settings, note the service account email (e.g., orvia@orvia-123.iam.gserviceaccount.com) -- you'll share calendars with this email during onboarding

- [ ] **Step 4: Set up all external accounts**

Create accounts for: Supabase (free tier), Vercel (free tier), Railway.app (for n8n), OpenAI (API key for GPT-4o-mini), ElevenLabs (for Hindi TTS voices).

---

## Phase 1: Foundation (Tasks 1-4)

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local.example`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd c:/W-Drive/scalyft-orvia
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Select: Yes to all defaults. This creates the Next.js 14 project with App Router, TypeScript, Tailwind, ESLint.

- [ ] **Step 2: Install core dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 3: Install UI dependencies**

```bash
npx shadcn@latest init
```

Select: New York style, Zinc color, CSS variables yes. Then:

```bash
npx shadcn@latest add button card table badge input label tabs
```

- [ ] **Step 4: Create environment template**

Create `.env.local.example`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Vapi
VAPI_API_KEY=sk-...
VAPI_WEBHOOK_SECRET=whsec_...

# n8n
N8N_BASE_URL=https://your-n8n.railway.app
N8N_WEBHOOK_SECRET=your-shared-secret-here

# Google Calendar (base64-encoded service account JSON from Task 0)
GOOGLE_CALENDAR_SERVICE_ACCOUNT=eyJ...

# WhatsApp Business API (or Gupshup)
WHATSAPP_API_TOKEN=your-whatsapp-token
WHATSAPP_PHONE_ID=your-phone-id
WHATSAPP_BUSINESS_ID=your-business-id
```

- [ ] **Step 5: Commit**

```bash
git init
echo "node_modules\n.next\n.env.local\n.env" > .gitignore
git add -A
git commit -m "chore: scaffold Next.js 14 project with Tailwind and shadcn/ui"
```

---

### Task 2: Supabase Schema & RLS

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create the migration file with full schema**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Orvia MVP Schema
-- 5 tables: clinics, users, calls, leads, appointments
-- All with Row Level Security

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CLINICS (tenants)
-- ============================================================
CREATE TABLE clinics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,
    phone_display   TEXT,
    vapi_phone_id   TEXT,
    vapi_assistant_id TEXT,
    timezone        TEXT DEFAULT 'Asia/Kolkata',
    settings        JSONB DEFAULT '{}'::jsonb,
    status          TEXT DEFAULT 'onboarding' CHECK (status IN ('active', 'inactive', 'onboarding')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN clinics.settings IS 'JSONB: { greeting, hours, services[], languages[], emergency_number, calendar_id, transfer_number }';

-- ============================================================
-- USERS (dashboard access, linked to Supabase Auth)
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
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
    clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    vapi_call_id    TEXT UNIQUE,
    caller_phone    TEXT,
    language_detected TEXT DEFAULT 'en' CHECK (language_detected IN ('hi', 'en')),
    status          TEXT DEFAULT 'in_progress' CHECK (status IN (
                        'in_progress', 'completed', 'missed', 'failed', 'transferred'
                    )),
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    duration_secs   INTEGER,
    transcript      JSONB,
    summary         TEXT,
    recording_url   TEXT,
    extracted_data  JSONB DEFAULT '{}'::jsonb,
    outcome         TEXT CHECK (outcome IN (
                        'appointment_booked', 'lead_captured', 'info_given', 'transferred', 'missed'
                    )),
    cost_cents      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE leads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    call_id         UUID REFERENCES calls(id) ON DELETE SET NULL,
    name            TEXT,
    phone           TEXT NOT NULL,
    email           TEXT,
    service_needed  TEXT,
    urgency         TEXT DEFAULT 'routine' CHECK (urgency IN (
                        'emergency', 'urgent', 'routine', 'inquiry'
                    )),
    notes           TEXT,
    status          TEXT DEFAULT 'new' CHECK (status IN (
                        'new', 'contacted', 'booked', 'closed', 'lost'
                    )),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
    call_id         UUID REFERENCES calls(id) ON DELETE SET NULL,
    patient_name    TEXT NOT NULL,
    patient_phone   TEXT NOT NULL,
    service_type    TEXT,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end   TIMESTAMPTZ,
    notes           TEXT,
    status          TEXT DEFAULT 'confirmed' CHECK (status IN (
                        'confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled'
                    )),
    google_cal_event_id TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_calls_clinic_created ON calls(clinic_id, created_at DESC);
CREATE INDEX idx_calls_vapi_id ON calls(vapi_call_id);
CREATE INDEX idx_leads_clinic_created ON leads(clinic_id, created_at DESC);
CREATE INDEX idx_leads_clinic_status ON leads(clinic_id, status);
CREATE INDEX idx_appointments_clinic_start ON appointments(clinic_id, scheduled_start);
CREATE INDEX idx_users_clinic ON users(clinic_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Users can only see their own clinic's data
CREATE POLICY "users_own_clinic" ON clinics
    FOR ALL USING (
        id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    );

CREATE POLICY "users_own_record" ON users
    FOR ALL USING (id = auth.uid());

CREATE POLICY "calls_own_clinic" ON calls
    FOR ALL USING (
        clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    );

CREATE POLICY "leads_own_clinic" ON leads
    FOR ALL USING (
        clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    );

CREATE POLICY "appointments_own_clinic" ON appointments
    FOR ALL USING (
        clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    );

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clinics_updated_at BEFORE UPDATE ON clinics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Run the migration against your Supabase project**

Go to Supabase Dashboard -> SQL Editor -> paste and run the entire SQL file.

Verify: check that all 5 tables appear in Table Editor, RLS is enabled (lock icon) on each table.

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add initial database schema with RLS policies"
```

---

### Task 3: Supabase Client Setup & TypeScript Types

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/lib/types.ts`, `src/middleware.ts`

- [ ] **Step 1: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create server Supabase client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}

export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    }
  );
}
```

- [ ] **Step 3: Create auth middleware**

Create `src/lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // If not logged in and trying to access dashboard, redirect to login
  if (!user && !request.nextUrl.pathname.startsWith("/login") &&
      !request.nextUrl.pathname.startsWith("/reset-password") &&
      !request.nextUrl.pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If logged in and on login page, redirect to dashboard
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

Create `src/middleware.ts`:

```typescript
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 4: Create shared TypeScript types**

Create `src/lib/types.ts`:

```typescript
export interface Clinic {
  id: string;
  name: string;
  slug: string;
  phone_display: string | null;
  vapi_phone_id: string | null;
  vapi_assistant_id: string | null;
  timezone: string;
  settings: ClinicSettings;
  status: "active" | "inactive" | "onboarding";
  created_at: string;
  updated_at: string;
}

export interface ClinicSettings {
  greeting?: string;
  hours?: string;
  services?: string[];
  languages?: string[];
  emergency_number?: string;
  calendar_id?: string;
  transfer_number?: string;
}

export interface User {
  id: string;
  clinic_id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "admin" | "staff";
  created_at: string;
}

export interface Call {
  id: string;
  clinic_id: string;
  vapi_call_id: string | null;
  caller_phone: string | null;
  language_detected: "hi" | "en";
  status: "in_progress" | "completed" | "missed" | "failed" | "transferred";
  started_at: string | null;
  ended_at: string | null;
  duration_secs: number | null;
  transcript: TranscriptTurn[] | null;
  summary: string | null;
  recording_url: string | null;
  extracted_data: Record<string, unknown>;
  outcome: "appointment_booked" | "lead_captured" | "info_given" | "transferred" | "missed" | null;
  cost_cents: number;
  created_at: string;
}

export interface TranscriptTurn {
  role: "assistant" | "user";
  content: string;
  timestamp?: number;
}

export interface Lead {
  id: string;
  clinic_id: string;
  call_id: string | null;
  name: string | null;
  phone: string;
  email: string | null;
  service_needed: string | null;
  urgency: "emergency" | "urgent" | "routine" | "inquiry";
  notes: string | null;
  status: "new" | "contacted" | "booked" | "closed" | "lost";
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  clinic_id: string;
  lead_id: string | null;
  call_id: string | null;
  patient_name: string;
  patient_phone: string;
  service_type: string | null;
  scheduled_start: string;
  scheduled_end: string | null;
  notes: string | null;
  status: "confirmed" | "cancelled" | "completed" | "no_show" | "rescheduled";
  google_cal_event_id: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ src/middleware.ts
git commit -m "feat: add Supabase client setup, auth middleware, and TypeScript types"
```

---

### Task 4: Vapi Assistant-Request Webhook

**Files:**
- Create: `src/app/api/vapi/assistant-request/route.ts`, `src/lib/vapi/build-assistant-config.ts`
- Test: `tests/lib/vapi/build-assistant-config.test.ts`

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Write failing test for build-assistant-config**

Create `tests/lib/vapi/build-assistant-config.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildAssistantConfig } from "@/lib/vapi/build-assistant-config";
import type { Clinic } from "@/lib/types";

const mockClinic: Clinic = {
  id: "clinic-123",
  name: "Dr. Sharma's Dental Clinic",
  slug: "dr-sharma-dental",
  phone_display: "+919876543210",
  vapi_phone_id: "pn_xyz789",
  vapi_assistant_id: null,
  timezone: "Asia/Kolkata",
  settings: {
    greeting: "Namaste! Dr. Sharma's Dental Clinic mein aapka swagat hai.",
    hours: "Mon-Sat 10am-7pm",
    services: ["cleaning", "filling", "root canal", "extraction", "braces"],
    languages: ["hi", "en"],
    emergency_number: "+919876543211",
    calendar_id: "abc123@group.calendar.google.com",
    transfer_number: "+919876543211",
  },
  status: "active",
  created_at: "2026-03-20T00:00:00Z",
  updated_at: "2026-03-20T00:00:00Z",
};

describe("buildAssistantConfig", () => {
  it("returns valid Vapi assistant config from clinic data", () => {
    const config = buildAssistantConfig(mockClinic, "https://n8n.example.com", "test-secret");

    expect(config.model.provider).toBe("openai");
    expect(config.model.model).toBe("gpt-4o-mini");
    expect(config.model.temperature).toBe(0.3);
    expect(config.model.systemPrompt).toContain("Dr. Sharma's Dental Clinic");
    expect(config.model.systemPrompt).toContain("Mon-Sat 10am-7pm");
    expect(config.firstMessage).toContain("Dr. Sharma's Dental Clinic");
    expect(config.voice.provider).toBe("11labs");
  });

  it("includes all 3 function tools + transferCall", () => {
    const config = buildAssistantConfig(mockClinic, "https://n8n.example.com", "test-secret");

    const functionTools = config.tools.filter((t: any) => t.type === "function");
    const transferTools = config.tools.filter((t: any) => t.type === "transferCall");

    expect(functionTools).toHaveLength(3);
    expect(transferTools).toHaveLength(1);

    const toolNames = functionTools.map((t: any) => t.function.name);
    expect(toolNames).toContain("capture_lead");
    expect(toolNames).toContain("check_availability");
    expect(toolNames).toContain("book_appointment");
  });

  it("sets webhook URLs pointing to n8n with secret", () => {
    const config = buildAssistantConfig(mockClinic, "https://n8n.example.com", "test-secret");

    const captureLead = config.tools.find(
      (t: any) => t.type === "function" && t.function.name === "capture_lead"
    );
    expect(captureLead.server.url).toBe("https://n8n.example.com/webhook/capture-lead");
    expect(captureLead.server.secret).toBe("test-secret");
  });

  it("sets transfer number from clinic settings", () => {
    const config = buildAssistantConfig(mockClinic, "https://n8n.example.com", "test-secret");

    const transfer = config.tools.find((t: any) => t.type === "transferCall");
    expect(transfer.destinations[0].number).toBe("+919876543211");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- tests/lib/vapi/build-assistant-config.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 4: Implement build-assistant-config**

Create `src/lib/vapi/build-assistant-config.ts`:

```typescript
import type { Clinic } from "@/lib/types";

export function buildAssistantConfig(
  clinic: Clinic,
  n8nBaseUrl: string,
  webhookSecret: string
) {
  const { settings } = clinic;
  const servicesStr = settings.services?.join(", ") || "general dental services";

  return {
    model: {
      provider: "openai" as const,
      model: "gpt-4o-mini",
      systemPrompt: buildSystemPrompt(clinic),
      temperature: 0.3,
    },
    voice: {
      provider: "11labs" as const,
      voiceId: "rachel", // TODO: Replace with Hindi-capable voice ID after testing
    },
    firstMessage: `Namaste! ${clinic.name} mein aapka swagat hai. Main Orvia hoon, aapki kaise madad kar sakti hoon? Welcome to ${clinic.name}. I'm Orvia, how can I help you today?`,
    tools: [
      {
        type: "function" as const,
        function: {
          name: "capture_lead",
          description: "Capture the patient's contact information and service need",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Patient's full name" },
              phone: { type: "string", description: "Patient's phone number (only if different from caller)" },
              service_needed: { type: "string", description: "What dental service they need" },
              urgency: {
                type: "string",
                enum: ["emergency", "urgent", "routine", "inquiry"],
                description: "How urgent is the request",
              },
              notes: { type: "string", description: "Any other relevant details" },
            },
            required: ["name", "service_needed", "urgency"],
          },
        },
        server: {
          url: `${n8nBaseUrl}/webhook/capture-lead`,
          secret: webhookSecret,
        },
      },
      {
        type: "function" as const,
        function: {
          name: "check_availability",
          description: "Check available appointment slots for a given date",
          parameters: {
            type: "object",
            properties: {
              date: { type: "string", description: "Date to check in YYYY-MM-DD format" },
              service_type: { type: "string", description: "Type of dental service" },
            },
            required: ["date"],
          },
        },
        server: {
          url: `${n8nBaseUrl}/webhook/check-availability`,
          secret: webhookSecret,
        },
      },
      {
        type: "function" as const,
        function: {
          name: "book_appointment",
          description: "Book a confirmed appointment for the patient",
          parameters: {
            type: "object",
            properties: {
              patient_name: { type: "string" },
              patient_phone: { type: "string" },
              service_type: { type: "string" },
              slot: { type: "string", description: "ISO 8601 datetime of the appointment" },
            },
            required: ["patient_name", "patient_phone", "service_type", "slot"],
          },
        },
        server: {
          url: `${n8nBaseUrl}/webhook/book-appointment`,
          secret: webhookSecret,
        },
      },
      {
        type: "transferCall" as const,
        destinations: [
          {
            type: "number" as const,
            number: settings.transfer_number || settings.emergency_number || "",
            message: "Ek minute, main aapko clinic se connect kar rahi hoon.",
          },
        ],
      },
    ],
    endCallPhrases: ["goodbye", "bye", "dhanyavaad", "shukriya", "bas itna hi", "thank you"],
    serverUrl: `${n8nBaseUrl}/webhook/vapi-events`,
  };
}

function buildSystemPrompt(clinic: Clinic): string {
  const { settings } = clinic;
  const services = settings.services?.join(", ") || "general dental services";

  return [
    `You are Orvia, the AI receptionist for ${clinic.name}.`,
    `You speak Hindi and English fluently -- match the caller's language.`,
    `Your job: (1) Greet warmly, (2) Understand what the patient needs, (3) Book an appointment or capture their details using the provided tools, (4) For emergencies (severe pain, swelling, trauma), transfer immediately using transferCall.`,
    `Always mention this call may be recorded.`,
    `Clinic hours: ${settings.hours || "10am-7pm Mon-Sat"}.`,
    `Services offered: ${services}.`,
    `If you cannot complete a booking or the system is unavailable, reassure the caller that the clinic will call them back within 30 minutes.`,
    `Be warm, professional, and concise. Do not provide medical advice.`,
  ].join(" ");
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- tests/lib/vapi/build-assistant-config.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 6: Create the webhook route (Edge Runtime)**

Create `src/app/api/vapi/assistant-request/route.ts`:

```typescript
import { buildAssistantConfig } from "@/lib/vapi/build-assistant-config";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Use a direct Supabase client (not the SSR one) to avoid cookie dependencies.
// This endpoint is called by Vapi, not by a browser.
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract phone number ID from Vapi's assistant-request payload
    const phoneNumberId = body?.message?.call?.phoneNumberId;
    if (!phoneNumberId) {
      return NextResponse.json(
        { error: "Missing phoneNumberId" },
        { status: 400 }
      );
    }

    // Lookup clinic by Vapi phone ID
    const supabase = getServiceClient();
    const { data: clinic, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("vapi_phone_id", phoneNumberId)
      .eq("status", "active")
      .single();

    if (error || !clinic) {
      console.error("Clinic not found for phoneNumberId:", phoneNumberId, error);
      return NextResponse.json(
        { error: "Clinic not found" },
        { status: 404 }
      );
    }

    // Build and return assistant config
    const n8nBaseUrl = process.env.N8N_BASE_URL || "https://n8n.railway.app";
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET || "";

    const assistantConfig = buildAssistantConfig(clinic, n8nBaseUrl, webhookSecret);

    return NextResponse.json(assistantConfig);
  } catch (err) {
    console.error("assistant-request error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

**Note:** This uses a direct `createClient` (not the SSR cookie-based one) because this endpoint is called by Vapi, not a browser. No RLS needed -- uses service_role key. To minimize cold start latency, deploy Vercel in the `bom1` (Mumbai) region via `vercel.json`: `{ "regions": ["bom1"] }`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/vapi/ src/app/api/ tests/ vitest.config.ts
git commit -m "feat: add Vapi assistant-request webhook with Edge Runtime"
```

---

## Phase 2: Auth & Dashboard Shell (Tasks 5-7)

### Task 5: Login Page

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Create the login page**

Create `src/app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Orvia</CardTitle>
          <CardDescription>Sign in to your clinic dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@clinic.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify by running dev server**

```bash
npm run dev
```

Visit `http://localhost:3000/login` -- should see the login card.

- [ ] **Step 3: Create the reset-password page**

Create `src/app/(auth)/reset-password/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set Your Password</CardTitle>
          <CardDescription>Create a password for your Orvia account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Setting password..." : "Set Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

This page is used when clinic owners click the password-reset link from the onboarding email (Task 11 create-clinic script).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "feat: add login and reset-password pages"
```

---

### Task 6: Dashboard Layout & Navigation

**Files:**
- Create: `src/components/nav.tsx`, `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create the navigation component**

Create `src/components/nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/calls", label: "Calls" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ clinicName }: { clinicName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b bg-white">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold text-lg">
            Orvia
          </Link>
          <span className="text-sm text-gray-500 hidden sm:inline">
            {clinicName}
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-gray-100 font-medium text-gray-900"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="ml-2 text-gray-500">
            Sign out
          </Button>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create the dashboard layout with auth guard**

Create `src/app/(dashboard)/layout.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import type { User, Clinic } from "@/lib/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Fetch the user's clinic
  const { data: profile } = await supabase
    .from("users")
    .select("*, clinics(*)")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  const clinic = (profile as any).clinics as Clinic;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav clinicName={clinic?.name || "Clinic"} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/nav.tsx src/app/\(dashboard\)/
git commit -m "feat: add dashboard layout with nav and auth guard"
```

---

### Task 7: Overview/Home Page

**Files:**
- Create: `src/components/stat-card.tsx`, `src/components/call-list.tsx`, `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create the stat card component**

Create `src/components/stat-card.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
}

export function StatCard({ title, value, description }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {description && (
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create the call list component**

Create `src/components/call-list.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Call } from "@/lib/types";

const outcomeColors: Record<string, string> = {
  appointment_booked: "bg-green-100 text-green-800",
  lead_captured: "bg-blue-100 text-blue-800",
  info_given: "bg-gray-100 text-gray-800",
  transferred: "bg-yellow-100 text-yellow-800",
  missed: "bg-red-100 text-red-800",
};

const outcomeLabels: Record<string, string> = {
  appointment_booked: "Booked",
  lead_captured: "Lead",
  info_given: "Info",
  transferred: "Transferred",
  missed: "Missed",
};

function formatDuration(secs: number | null): string {
  if (!secs) return "--";
  const mins = Math.floor(secs / 60);
  const remaining = secs % 60;
  return mins > 0 ? `${mins}m ${remaining}s` : `${remaining}s`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function CallList({ calls }: { calls: Call[] }) {
  if (calls.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No calls yet. Once your AI receptionist starts taking calls, they will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {calls.map((call) => (
        <Link
          key={call.id}
          href={`/calls/${call.id}`}
          className="block bg-white rounded-lg border p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div>
                <div className="font-medium text-sm">
                  {call.caller_phone || "Unknown"}
                </div>
                <div className="text-xs text-gray-500">
                  {formatDate(call.created_at)} at {formatTime(call.started_at)}
                  {" · "}
                  {formatDuration(call.duration_secs)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {call.summary && (
                <span className="text-xs text-gray-500 max-w-[200px] truncate hidden sm:inline">
                  {call.summary}
                </span>
              )}
              {call.outcome && (
                <Badge variant="secondary" className={outcomeColors[call.outcome] || ""}>
                  {outcomeLabels[call.outcome] || call.outcome}
                </Badge>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create the overview page**

Create `src/app/(dashboard)/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/stat-card";
import { CallList } from "@/components/call-list";
import type { Call } from "@/lib/types";

export default async function OverviewPage() {
  const supabase = await createClient();

  // Get today's date range in IST
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);

  // Fetch today's stats
  const { count: callsToday } = await supabase
    .from("calls")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfDay.toISOString())
    .in("status", ["completed", "transferred"]);

  const { count: leadsToday } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfDay.toISOString());

  const { count: appointmentsToday } = await supabase
    .from("appointments")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfDay.toISOString());

  // Fetch recent calls (last 15)
  const { data: recentCalls } = await supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(15);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Calls Today" value={callsToday || 0} />
        <StatCard title="Leads Captured" value={leadsToday || 0} />
        <StatCard title="Appointments Booked" value={appointmentsToday || 0} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Calls</h2>
        <CallList calls={(recentCalls as Call[]) || []} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify by running dev server**

```bash
npm run dev
```

Visit `http://localhost:3000` (should redirect to login if not authenticated, or show overview if seeded with test data).

- [ ] **Step 5: Commit**

```bash
git add src/components/stat-card.tsx src/components/call-list.tsx src/app/\(dashboard\)/page.tsx
git commit -m "feat: add overview page with stat cards and recent calls list"
```

---

**IMPORTANT:** Before proceeding to Phase 3, run `npm run seed` (Task 11) to populate the database with demo data. Otherwise, all pages will show empty states and you can't verify correctness visually. Jump to Task 11 Steps 1-5, run the seed, then come back here.

## Phase 3: Call Pages (Tasks 8-9)

### Task 8: Calls List Page

**Files:**
- Create: `src/app/(dashboard)/calls/page.tsx`

- [ ] **Step 1: Create the calls page**

Create `src/app/(dashboard)/calls/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { CallList } from "@/components/call-list";
import type { Call } from "@/lib/types";

export default async function CallsPage() {
  const supabase = await createClient();

  const { data: calls } = await supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Calls</h1>
      <CallList calls={(calls as Call[]) || []} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/calls/page.tsx
git commit -m "feat: add calls list page"
```

---

### Task 9: Call Detail Page

**Files:**
- Create: `src/app/(dashboard)/calls/[id]/page.tsx`, `src/components/call-detail.tsx`

- [ ] **Step 1: Create the call detail component**

Create `src/components/call-detail.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Call } from "@/lib/types";

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(secs: number | null): string {
  if (!secs) return "--";
  const mins = Math.floor(secs / 60);
  const remaining = secs % 60;
  return mins > 0 ? `${mins}m ${remaining}s` : `${remaining}s`;
}

const outcomeLabels: Record<string, string> = {
  appointment_booked: "Appointment Booked",
  lead_captured: "Lead Captured",
  info_given: "Info Given",
  transferred: "Transferred to Clinic",
  missed: "Missed",
};

export function CallDetail({ call }: { call: Call }) {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Call Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {call.summary ? (
            <p className="text-gray-700">{call.summary}</p>
          ) : (
            <p className="text-gray-400 italic">No summary available</p>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Caller:</span>{" "}
              <span className="font-medium">{call.caller_phone || "Unknown"}</span>
            </div>
            <div>
              <span className="text-gray-500">Duration:</span>{" "}
              <span className="font-medium">{formatDuration(call.duration_secs)}</span>
            </div>
            <div>
              <span className="text-gray-500">Time:</span>{" "}
              <span className="font-medium">{formatDateTime(call.started_at)}</span>
            </div>
            <div>
              <span className="text-gray-500">Language:</span>{" "}
              <span className="font-medium">{call.language_detected === "hi" ? "Hindi" : "English"}</span>
            </div>
            <div>
              <span className="text-gray-500">Outcome:</span>{" "}
              <Badge variant="secondary">
                {call.outcome ? outcomeLabels[call.outcome] || call.outcome : "In Progress"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        {call.caller_phone && (
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${call.caller_phone}`}>Call Back</a>
          </Button>
        )}
        {call.recording_url && (
          <Button asChild variant="outline" size="sm">
            <a href={call.recording_url} target="_blank" rel="noopener noreferrer">
              Play Recording
            </a>
          </Button>
        )}
      </div>

      {/* Transcript */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Transcript</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTranscript(!showTranscript)}
            >
              {showTranscript ? "Hide" : "Show"}
            </Button>
          </div>
        </CardHeader>
        {showTranscript && (
          <CardContent>
            {call.transcript && call.transcript.length > 0 ? (
              <div className="space-y-3">
                {call.transcript.map((turn, i) => (
                  <div
                    key={i}
                    className={`flex ${turn.role === "assistant" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        turn.role === "assistant"
                          ? "bg-gray-100 text-gray-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      <div className="text-xs font-medium mb-1">
                        {turn.role === "assistant" ? "Orvia" : "Patient"}
                      </div>
                      {turn.content}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 italic">No transcript available</p>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create the call detail page**

Create `src/app/(dashboard)/calls/[id]/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CallDetail } from "@/components/call-detail";
import Link from "next/link";
import type { Call } from "@/lib/types";

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: call, error } = await supabase
    .from("calls")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !call) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/calls" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; All Calls
        </Link>
      </div>
      <CallDetail call={call as Call} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/call-detail.tsx src/app/\(dashboard\)/calls/
git commit -m "feat: add call detail page with transcript and recording link"
```

---

## Phase 4: Settings & Seed Data (Tasks 10-11)

### Task 10: Settings Page (Read-Only)

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create the read-only settings page**

Create `src/app/(dashboard)/settings/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Clinic } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("*, clinics(*)")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const clinic = (profile as any).clinics as Clinic;
  const settings = clinic.settings || {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Clinic Information</CardTitle>
          <CardDescription>
            To update these settings, contact Scalyft support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Clinic Name:</span>
              <div className="font-medium">{clinic.name}</div>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <div>
                <Badge variant={clinic.status === "active" ? "default" : "secondary"}>
                  {clinic.status}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-gray-500">Phone:</span>
              <div className="font-medium">{clinic.phone_display || "--"}</div>
            </div>
            <div>
              <span className="text-gray-500">Hours:</span>
              <div className="font-medium">{settings.hours || "--"}</div>
            </div>
            <div>
              <span className="text-gray-500">Emergency Number:</span>
              <div className="font-medium">{settings.emergency_number || "--"}</div>
            </div>
            <div>
              <span className="text-gray-500">Languages:</span>
              <div className="font-medium">
                {settings.languages?.join(", ") || "Hindi, English"}
              </div>
            </div>
          </div>

          {settings.services && settings.services.length > 0 && (
            <div>
              <span className="text-gray-500 text-sm">Services:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {settings.services.map((service: string) => (
                  <Badge key={service} variant="outline">
                    {service}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {settings.greeting && (
            <div>
              <span className="text-gray-500 text-sm">AI Greeting:</span>
              <div className="mt-1 text-sm bg-gray-50 rounded p-3 italic">
                "{settings.greeting}"
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-gray-500">Email:</span>{" "}
            <span className="font-medium">{user.email}</span>
          </div>
          <div>
            <span className="text-gray-500">Role:</span>{" "}
            <span className="font-medium capitalize">{(profile as any).role}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/settings/
git commit -m "feat: add read-only settings page"
```

---

### Task 11: Admin Seed Script & Demo Clinic

**Files:**
- Create: `scripts/seed-demo-clinic.ts`, `scripts/create-clinic.ts`

- [ ] **Step 1: Install script dependencies**

```bash
npm install -D tsx dotenv
```

- [ ] **Step 2: Create the seed script for demo/testing**

Create `scripts/seed-demo-clinic.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  console.log("Seeding demo clinic...");

  // 1. Create demo clinic
  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .upsert(
      {
        name: "Dr. Demo's Dental Clinic",
        slug: "dr-demo-dental",
        phone_display: "+919999999999",
        vapi_phone_id: "pn_demo_123",
        timezone: "Asia/Kolkata",
        settings: {
          greeting: "Namaste! Dr. Demo's Dental Clinic mein aapka swagat hai.",
          hours: "Mon-Sat 10am-7pm",
          services: ["cleaning", "filling", "root canal", "extraction", "braces", "cosmetic"],
          languages: ["hi", "en"],
          emergency_number: "+919999999998",
          calendar_id: "demo-calendar@group.calendar.google.com",
          transfer_number: "+919999999998",
        },
        status: "active",
      },
      { onConflict: "slug" }
    )
    .select()
    .single();

  if (clinicError) {
    console.error("Failed to create clinic:", clinicError);
    return;
  }

  console.log("Clinic created:", clinic.id);

  // 2. Insert sample calls
  const sampleCalls = [
    {
      clinic_id: clinic.id,
      vapi_call_id: "demo_call_1",
      caller_phone: "+919876543210",
      language_detected: "hi",
      status: "completed",
      started_at: new Date(Date.now() - 3600000).toISOString(),
      ended_at: new Date(Date.now() - 3300000).toISOString(),
      duration_secs: 180,
      summary: "Patient called about tooth pain. Appointment booked for tomorrow at 2:30 PM.",
      outcome: "appointment_booked",
      transcript: [
        { role: "assistant", content: "Namaste! Dr. Demo's Dental Clinic mein aapka swagat hai. Main Orvia hoon." },
        { role: "user", content: "Mujhe tooth mein bahut dard ho raha hai." },
        { role: "assistant", content: "Main samajh sakti hoon. Kab se dard ho raha hai?" },
        { role: "user", content: "Kal se. Bahut zyada dard hai." },
        { role: "assistant", content: "Theek hai, main aapka appointment book karti hoon. Kal 2:30 PM available hai." },
        { role: "user", content: "Haan, theek hai." },
        { role: "assistant", content: "Aapka appointment kal 2:30 PM pe book ho gaya hai. Dhanyavaad!" },
      ],
    },
    {
      clinic_id: clinic.id,
      vapi_call_id: "demo_call_2",
      caller_phone: "+919876543211",
      language_detected: "en",
      status: "completed",
      started_at: new Date(Date.now() - 7200000).toISOString(),
      ended_at: new Date(Date.now() - 7000000).toISOString(),
      duration_secs: 120,
      summary: "Patient inquired about cleaning services and pricing. Lead captured.",
      outcome: "lead_captured",
      transcript: [
        { role: "assistant", content: "Welcome to Dr. Demo's Dental Clinic. I'm Orvia, how can I help?" },
        { role: "user", content: "I want to know about teeth cleaning." },
        { role: "assistant", content: "We offer professional teeth cleaning. Can I have your name to schedule a consultation?" },
        { role: "user", content: "My name is Priya Singh." },
        { role: "assistant", content: "Thank you Priya. The clinic team will call you back with details." },
      ],
    },
    {
      clinic_id: clinic.id,
      vapi_call_id: "demo_call_3",
      caller_phone: "+919876543212",
      language_detected: "hi",
      status: "completed",
      started_at: new Date(Date.now() - 10800000).toISOString(),
      ended_at: new Date(Date.now() - 10700000).toISOString(),
      duration_secs: 60,
      summary: "Patient asked about clinic hours and location.",
      outcome: "info_given",
    },
  ];

  const { error: callsError } = await supabase.from("calls").upsert(sampleCalls, {
    onConflict: "vapi_call_id",
  });

  if (callsError) {
    console.error("Failed to insert calls:", callsError);
    return;
  }

  // 3. Insert sample leads
  const { error: leadsError } = await supabase.from("leads").insert([
    {
      clinic_id: clinic.id,
      name: "Rahul Sharma",
      phone: "+919876543210",
      service_needed: "tooth pain - emergency",
      urgency: "urgent",
      status: "booked",
    },
    {
      clinic_id: clinic.id,
      name: "Priya Singh",
      phone: "+919876543211",
      service_needed: "teeth cleaning",
      urgency: "routine",
      status: "new",
    },
  ]);

  if (leadsError) {
    console.error("Failed to insert leads:", leadsError);
    return;
  }

  // 4. Insert sample appointment
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 30, 0, 0);

  const { error: apptError } = await supabase.from("appointments").insert({
    clinic_id: clinic.id,
    patient_name: "Rahul Sharma",
    patient_phone: "+919876543210",
    service_type: "tooth pain consultation",
    scheduled_start: tomorrow.toISOString(),
    status: "confirmed",
  });

  if (apptError) {
    console.error("Failed to insert appointment:", apptError);
    return;
  }

  console.log("Demo clinic seeded successfully!");
  console.log("Clinic ID:", clinic.id);
  console.log("\nTo create a login user, run:");
  console.log(`npx tsx scripts/create-clinic.ts --email your@email.com --clinic-id ${clinic.id}`);
}

seed().catch(console.error);
```

- [ ] **Step 3: Create the admin clinic onboarding script**

Create `scripts/create-clinic.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createClinicUser() {
  const args = process.argv.slice(2);
  const emailIdx = args.indexOf("--email");
  const clinicIdx = args.indexOf("--clinic-id");

  if (emailIdx === -1 || clinicIdx === -1) {
    console.log("Usage: npx tsx scripts/create-clinic.ts --email user@example.com --clinic-id <uuid>");
    process.exit(1);
  }

  const email = args[emailIdx + 1];
  const clinicId = args[clinicIdx + 1];

  // 1. Create Supabase Auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (authError) {
    console.error("Failed to create auth user:", authError);
    return;
  }

  console.log("Auth user created:", authUser.user.id);

  // 2. Link to clinic in users table
  const { error: userError } = await supabase.from("users").insert({
    id: authUser.user.id,
    clinic_id: clinicId,
    email,
    role: "owner",
  });

  if (userError) {
    console.error("Failed to link user to clinic:", userError);
    return;
  }

  // 3. Generate password reset link
  const { data: resetData, error: resetError } =
    await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
    });

  if (resetError) {
    console.error("Failed to generate reset link:", resetError);
    return;
  }

  console.log("\nUser created and linked to clinic!");
  console.log("Send this password reset link to the clinic owner:");
  console.log(resetData.properties?.action_link);
}

createClinicUser().catch(console.error);
```

- [ ] **Step 4: Add script commands to package.json**

Add to `package.json` scripts:

```json
"seed": "tsx scripts/seed-demo-clinic.ts",
"create-clinic": "tsx scripts/create-clinic.ts"
```

- [ ] **Step 5: Run the seed script to verify**

```bash
cp .env.local.example .env.local
# Fill in real Supabase credentials in .env.local
npm run seed
```

Expected: "Demo clinic seeded successfully!" with clinic ID printed.

- [ ] **Step 6: Commit**

```bash
git add scripts/ package.json
git commit -m "feat: add admin scripts for seeding demo clinic and creating clinic users"
```

---

## Phase 5: Realtime & Polish (Tasks 12-13)

### Task 12: Supabase Realtime for Live Dashboard Updates

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`
- Create: `src/components/realtime-calls.tsx`

- [ ] **Step 1: Create a realtime wrapper component**

Create `src/components/realtime-calls.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CallList } from "@/components/call-list";
import type { Call } from "@/lib/types";

export function RealtimeCalls({ initialCalls, clinicId }: { initialCalls: Call[]; clinicId: string }) {
  const [calls, setCalls] = useState<Call[]>(initialCalls);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel("calls-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calls",
          filter: `clinic_id=eq.${clinicId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setCalls((prev) => [payload.new as Call, ...prev].slice(0, 15));
          } else if (payload.eventType === "UPDATE") {
            setCalls((prev) =>
              prev.map((c) => (c.id === (payload.new as Call).id ? (payload.new as Call) : c))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return <CallList calls={calls} />;
}
```

- [ ] **Step 2: Update overview page to use realtime component**

In `src/app/(dashboard)/page.tsx`, replace the `CallList` usage at the bottom with `RealtimeCalls`:

Add import:
```tsx
import { RealtimeCalls } from "@/components/realtime-calls";
```

Replace:
```tsx
<CallList calls={(recentCalls as Call[]) || []} />
```
With:
```tsx
<RealtimeCalls initialCalls={(recentCalls as Call[]) || []} clinicId={clinicId} />
```

You'll also need to fetch the `clinicId` in the overview page -- add this after the auth check at the top of the component:

```tsx
const { data: profile } = await supabase
  .from("users")
  .select("clinic_id")
  .eq("id", (await supabase.auth.getUser()).data.user!.id)
  .single();
const clinicId = profile!.clinic_id;
```

- [ ] **Step 3: Enable Realtime on the calls table in Supabase**

Go to Supabase Dashboard -> Database -> Replication. Enable realtime for the `calls` table.

Or run in SQL Editor:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE calls;
```

- [ ] **Step 4: Commit**

```bash
git add src/components/realtime-calls.tsx src/app/\(dashboard\)/page.tsx
git commit -m "feat: add realtime call updates on overview page"
```

---

### Task 13: Root Page Redirect & Final Wiring

**Files:**
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`

- [ ] **Step 1: Update root layout with proper metadata**

Update `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Orvia - AI Front Desk for Dental Clinics",
  description: "AI receptionist that answers every patient call in Hindi or English",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Remove default Next.js root page content**

Delete `src/app/page.tsx` entirely. The `(dashboard)/page.tsx` will serve as the root page since `(dashboard)` is a route group (parentheses are not part of the URL).

```bash
rm src/app/page.tsx
```

- [ ] **Step 3: Final test -- run dev server and verify all pages**

```bash
npm run dev
```

Verify:
- `/login` -- login form renders
- `/` -- overview page (redirects to login if not authenticated)
- `/calls` -- call list page
- `/calls/:id` -- call detail with transcript
- `/settings` -- read-only settings
- `/api/vapi/assistant-request` -- POST returns 400 (missing phoneNumberId)

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: finalize root layout and page routing"
```

---

## Phase 6: Deployment & n8n (Tasks 14-15)

### Task 14: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/scalyft/orvia.git
git push -u origin main
```

(Create the repo on GitHub first if it doesn't exist.)

- [ ] **Step 2: Connect to Vercel**

Go to vercel.com -> Import Git Repository -> select `scalyft/orvia`.

Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPI_API_KEY`
- `VAPI_WEBHOOK_SECRET`
- `N8N_BASE_URL` (your Railway n8n URL)
- `N8N_WEBHOOK_SECRET`

Deploy. Verify the dashboard loads at the Vercel URL.

- [ ] **Step 3: Set up custom domain (optional)**

In Vercel -> Settings -> Domains -> add `app.scalyft.tech` or `app.orvia.in`. Update DNS accordingly.

- [ ] **Step 4: Commit any Vercel config changes**

```bash
git add -A
git commit -m "chore: add Vercel deployment configuration"
```

---

### Task 15: n8n Workflow Setup (Manual Configuration)

This task is done in the n8n UI, not in code. Document what to build.

- [ ] **Step 1: Deploy n8n on Railway**

Go to railway.app -> New Project -> Deploy n8n template. Set environment variables:
- `N8N_BASIC_AUTH_ACTIVE=true`
- `N8N_BASIC_AUTH_USER=admin`
- `N8N_BASIC_AUTH_PASSWORD=<strong password>`
- `DB_TYPE=postgresdb` (use Railway's Postgres addon)
- `N8N_WEBHOOK_URL=https://<your-n8n>.railway.app/`

Note the deployed URL (e.g., `https://orvia-n8n.railway.app`).

- [ ] **Step 2: Create workflow: Call Started**

In n8n, create a new workflow:
1. **Webhook node** -- Method: POST, Path: `/call-started`, Authentication: Header Auth (Header Name: `x-webhook-secret`, Header Value: your N8N_WEBHOOK_SECRET)
2. **Set node** -- Extract `call_id`, `phone_number_id`, `customer_number` from `{{ $json.message.call }}`
3. **HTTP Request node** -- GET to `{{N8N_SUPABASE_URL}}/rest/v1/clinics?vapi_phone_id=eq.{{phone_number_id}}&select=id` with headers: `apikey: {{N8N_SUPABASE_SERVICE_KEY}}`, `Authorization: Bearer {{N8N_SUPABASE_SERVICE_KEY}}`
4. **HTTP Request node** -- POST to `{{N8N_SUPABASE_URL}}/rest/v1/calls` with body: `{ "vapi_call_id": "{{call_id}}", "clinic_id": "{{clinic_id}}", "caller_phone": "{{customer_number}}", "status": "in_progress", "started_at": "{{$now.toISO()}}" }` and same auth headers
5. **Respond to Webhook node** -- Return `{ "success": true }`

- [ ] **Step 3: Create workflow: Capture Lead**

1. **Webhook node** -- Path: `/capture-lead`, Header Auth
2. **Set node** -- Extract function call parameters + call ID from body
3. **Supabase node** -- Look up call record by `vapi_call_id` to get `clinic_id`
4. **Supabase node** -- INSERT into `leads` table
5. **WhatsApp node** (HTTP Request to WhatsApp API or Gupshup) -- Send notification to clinic owner
6. **Respond to Webhook** -- Return result message for AI to speak

- [ ] **Step 4: Configure Google Calendar in n8n**

Before building the availability/booking workflows:
1. In n8n, go to Credentials -> Add New -> Google Calendar OAuth2 (or Service Account)
2. If using service account: paste the JSON key from Task 0 Step 3
3. Test the connection by listing calendars

For each onboarded clinic:
1. Create a new Google Calendar in the service account (via Calendar API or Google Calendar UI)
2. Share the calendar with the clinic owner's email (Viewer or Editor access)
3. Store the `calendar_id` in the clinic's `settings.calendar_id` field in Supabase

- [ ] **Step 5: Create workflow: Check Availability**

1. **Webhook node** -- Path: `/check-availability`, Header Auth
2. **Set node** -- Extract date, service type, and vapi_call_id from body
3. **HTTP Request node** -- Query Supabase REST API: GET `/rest/v1/calls?vapi_call_id=eq.{{call_id}}&select=clinic_id` with service_role key in Authorization header. This gets the clinic_id.
4. **HTTP Request node** -- Query Supabase: GET `/rest/v1/clinics?id=eq.{{clinic_id}}&select=settings` to get the `calendar_id`
5. **Google Calendar node** -- List events for the date on that calendar_id
6. **Code node** -- Calculate available 30-min slots between clinic hours (default 10am-7pm), excluding existing events
7. **Respond to Webhook** -- Return `{ "result": "Available slots: 10:00 AM, 2:30 PM, 4:00 PM" }`

- [ ] **Step 5: Create workflow: Book Appointment**

1. **Webhook node** -- Path: `/book-appointment`, Header Auth
2. **Set node** -- Extract booking details
3. **Supabase node** -- Look up clinic for `calendar_id`
4. **Google Calendar node** -- Create event
5. **Supabase node** -- INSERT into `appointments` table
6. **WhatsApp node** -- Notify clinic owner of new appointment
7. **Respond to Webhook** -- Return confirmation for AI to speak

- [ ] **Step 6: Create workflow: Call Ended**

1. **Webhook node** -- Path: `/call-ended`, Header Auth
2. **Set node** -- Extract transcript, summary, recording URL, call ID
3. **Supabase node** -- UPDATE `calls` table with transcript, summary, recording_url, status='completed', duration, ended_at
4. **Respond to Webhook** -- Return `{ "success": true }`

- [ ] **Step 8: Configure WhatsApp notifications in n8n**

**If WhatsApp Business API is approved (Meta or Gupshup):**
1. In n8n, create credentials for your BSP (HTTP Request with bearer token)
2. Create approved message templates in the BSP dashboard, e.g.:
   - `new_lead`: "New patient: {{1}} needs {{2}}. Phone: {{3}}. Urgency: {{4}}."
   - `appointment_booked`: "Appointment booked: {{1}}, {{2}}, {{3}} at {{4}}."
3. In the capture_lead and book_appointment workflows, add an HTTP Request node that sends the WhatsApp template message to the clinic owner's number via the BSP API

**If WhatsApp API is NOT yet approved (fallback for pilot):**
1. Install whatsapp-web.js on the n8n Railway instance or a separate small service
2. Scan the QR code with a dedicated WhatsApp number
3. Send messages via the library's `sendMessage` function
4. This is a temporary bridge -- migrate to official API once approved

The WhatsApp notification node should be the LAST step in capture_lead and book_appointment workflows. If WhatsApp sending fails, the rest of the workflow should still succeed (lead/appointment is saved).

- [ ] **Step 9: Set up UptimeRobot monitoring**

Go to uptimerobot.com -> Add New Monitor:
- Type: HTTP(s)
- URL: `https://<your-n8n>.railway.app/healthz`
- Interval: 5 minutes
- Alert: email notification

- [ ] **Step 8: Document n8n URLs**

Update the Vercel `N8N_BASE_URL` env var with the actual Railway URL.

---

## Post-Implementation Checklist

After all tasks are complete:

- [ ] All tests pass (`npm test`)
- [ ] Dashboard loads on Vercel with real Supabase data
- [ ] Demo clinic is seeded and accessible via login
- [ ] Vapi assistant-request webhook responds correctly
- [ ] n8n workflows trigger on Vapi events
- [ ] WhatsApp notifications are sent (or fallback is working)
- [ ] Google Calendar events are created for appointments
- [ ] Call recordings are accessible from the dashboard
- [ ] Realtime updates appear on the overview page

---

## What's NOT in This Plan (Deferred to v2)

- Self-serve onboarding wizard
- Settings page editing (currently read-only)
- Dashboard search and filters
- Custom audio player (uses Vapi recording URL link)
- Regional language support
- Outbound calls
- Analytics/reporting beyond stat cards
- Billing system (use Razorpay manual links)
- Multi-location support
