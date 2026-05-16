-- ============================================================
-- ORVIA: Full schema + seed — paste this in Supabase SQL editor
-- Run this ONCE to set up your database from scratch.
-- Safe to re-run: uses DROP IF EXISTS before recreating.
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Drop existing tables (clean slate) ──────────────────────
DROP TABLE IF EXISTS appointments  CASCADE;
DROP TABLE IF EXISTS leads         CASCADE;
DROP TABLE IF EXISTS calls         CASCADE;
DROP TABLE IF EXISTS users         CASCADE;
DROP TABLE IF EXISTS clinics       CASCADE;

-- ─── Drop existing functions / triggers ─────────────────────
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;

-- ============================================================
-- CLINICS (tenants)
-- ============================================================
CREATE TABLE clinics (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              TEXT NOT NULL,
    slug              TEXT UNIQUE NOT NULL,
    phone_display     TEXT,
    vapi_phone_id     TEXT,
    vapi_assistant_id TEXT,
    timezone          TEXT DEFAULT 'Asia/Kolkata',
    settings          JSONB DEFAULT '{}'::jsonb,
    status            TEXT DEFAULT 'onboarding'
                      CHECK (status IN ('active', 'inactive', 'onboarding')),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN clinics.settings IS
  'All AI config: greeting, hours, services, faq, receptionist_name, tone, emergency_protocol, calendar, etc.';

-- ============================================================
-- USERS (dashboard logins — linked to Supabase Auth)
-- ============================================================
CREATE TABLE users (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id  UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    full_name  TEXT,
    role       TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'staff')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CALLS
-- ============================================================
CREATE TABLE calls (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id         UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    vapi_call_id      TEXT UNIQUE,
    caller_phone      TEXT,
    language_detected TEXT DEFAULT 'en' CHECK (language_detected IN ('hi', 'en')),
    status            TEXT DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress', 'completed', 'missed', 'failed', 'transferred')),
    started_at        TIMESTAMPTZ,
    ended_at          TIMESTAMPTZ,
    duration_secs     INTEGER,
    transcript        JSONB,
    summary           TEXT,
    recording_url     TEXT,
    extracted_data    JSONB DEFAULT '{}'::jsonb,
    outcome           TEXT CHECK (outcome IN (
                          'appointment_booked', 'lead_captured', 'info_given', 'transferred', 'missed'
                      )),
    cost_cents        INTEGER DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE leads (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id      UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    call_id        UUID REFERENCES calls(id) ON DELETE SET NULL,
    name           TEXT,
    phone          TEXT NOT NULL,
    email          TEXT,
    service_needed TEXT,
    urgency        TEXT DEFAULT 'routine'
                   CHECK (urgency IN ('emergency', 'urgent', 'routine', 'inquiry')),
    notes          TEXT,
    status         TEXT DEFAULT 'new'
                   CHECK (status IN ('new', 'contacted', 'booked', 'closed', 'lost')),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE appointments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id           UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    lead_id             UUID REFERENCES leads(id) ON DELETE SET NULL,
    call_id             UUID REFERENCES calls(id) ON DELETE SET NULL,
    patient_name        TEXT NOT NULL,
    patient_phone       TEXT NOT NULL,
    service_type        TEXT,
    scheduled_start     TIMESTAMPTZ NOT NULL,
    scheduled_end       TIMESTAMPTZ,
    notes               TEXT,
    status              TEXT DEFAULT 'confirmed'
                        CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled')),
    google_cal_event_id TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_calls_clinic_created        ON calls(clinic_id, created_at DESC);
CREATE INDEX idx_calls_vapi_id               ON calls(vapi_call_id);
CREATE INDEX idx_leads_clinic_created        ON leads(clinic_id, created_at DESC);
CREATE INDEX idx_leads_clinic_status         ON leads(clinic_id, status);
CREATE INDEX idx_appointments_clinic_start   ON appointments(clinic_id, scheduled_start);
CREATE INDEX idx_users_clinic                ON users(clinic_id);

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

CREATE TRIGGER clinics_updated_at      BEFORE UPDATE ON clinics      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER leads_updated_at        BEFORE UPDATE ON leads        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE clinics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Clinic owners see only their own clinic
CREATE POLICY "clinics_own"       ON clinics      FOR ALL USING (id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "users_own_record"  ON users        FOR ALL USING (id = auth.uid());
CREATE POLICY "calls_own_clinic"  ON calls        FOR ALL USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "leads_own_clinic"  ON leads        FOR ALL USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
CREATE POLICY "appts_own_clinic"  ON appointments FOR ALL USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

-- ============================================================
-- REALTIME (live dashboard updates for calls)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE calls;

-- ============================================================
-- SEED: Demo clinic (Dr. Sharma's Dental Care)
-- ============================================================
INSERT INTO clinics (
    name, slug, phone_display, timezone, status, settings
) VALUES (
    'Dr. Sharma''s Dental Care',
    'sharma-dental',
    '+91 98765 43210',
    'Asia/Kolkata',
    'active',
    '{
      "doctor_name": "Dr. Priya Sharma",
      "tagline": "Gentle care for your smile",
      "address": "204, 2nd Floor, ABC Complex, MG Road, Pune",
      "landmark": "Above SBI Bank, opposite City Mall",
      "city": "Pune",
      "receptionist_name": "Orvia",
      "tone": "warm, professional, reassuring",
      "language_preference": "english",
      "special_instructions": [
        "Always reassure nervous patients - dental anxiety is common",
        "For emergency/pain cases, express empathy first before booking",
        "Never give exact prices - always say starting from or typically ranges",
        "If someone asks for Dr. Sharma directly, say she is with a patient and offer to book a callback or appointment",
        "For braces, implants, and root canal - always book a consultation first, not the treatment directly"
      ],
      "operating_hours": {
        "monday":    { "open": "09:00", "close": "20:00", "lunch_break": "13:00-14:00" },
        "tuesday":   { "open": "09:00", "close": "20:00", "lunch_break": "13:00-14:00" },
        "wednesday": { "open": "09:00", "close": "20:00", "lunch_break": "13:00-14:00" },
        "thursday":  { "open": "09:00", "close": "20:00", "lunch_break": "13:00-14:00" },
        "friday":    { "open": "09:00", "close": "20:00", "lunch_break": "13:00-14:00" },
        "saturday":  { "open": "09:00", "close": "15:00", "lunch_break": null },
        "sunday":    { "closed": true }
      },
      "service_details": [
        { "name": "General Checkup", "duration_minutes": 30, "price_range": "300-500", "description": "Routine dental examination with cleaning", "can_book_directly": true },
        { "name": "Teeth Cleaning / Scaling", "duration_minutes": 45, "price_range": "800-1500", "description": "Professional cleaning and polishing", "can_book_directly": true },
        { "name": "Tooth Extraction", "duration_minutes": 30, "price_range": "500-2000", "description": "Simple or surgical extraction", "can_book_directly": true },
        { "name": "Root Canal Treatment", "duration_minutes": 60, "price_range": "3000-8000", "description": "Single or multi-sitting RCT", "can_book_directly": false, "note": "Requires consultation first" },
        { "name": "Braces / Orthodontics", "duration_minutes": 45, "price_range": "25000-80000", "description": "Metal or ceramic braces, clear aligners", "can_book_directly": false, "note": "Book consultation first" },
        { "name": "Dental Implants", "duration_minutes": 60, "price_range": "20000-50000", "description": "Single or multiple implants", "can_book_directly": false, "note": "Requires X-ray and consultation first" },
        { "name": "Teeth Whitening", "duration_minutes": 60, "price_range": "5000-15000", "description": "In-office professional whitening", "can_book_directly": true },
        { "name": "Emergency / Pain", "duration_minutes": 30, "price_range": "500-1500", "description": "Toothache, swelling, broken tooth", "can_book_directly": true, "priority": "high", "note": "Try to book same-day or next available" }
      ],
      "faq": [
        { "question": "Do you accept insurance?", "answer": "We accept most major dental insurance plans. Please bring your insurance card to your appointment and we will verify coverage." },
        { "question": "Is parking available?", "answer": "Yes, there is free parking in the basement of ABC Complex." },
        { "question": "Do you treat children?", "answer": "Yes, Dr. Sharma treats patients of all ages including children. We recommend first dental visit by age 1." },
        { "question": "What payment methods do you accept?", "answer": "We accept cash, UPI, all major debit and credit cards, and EMI options for treatments above 10000 rupees." },
        { "question": "How long does a root canal take?", "answer": "A root canal typically takes 1-2 sittings of about 45-60 minutes each, depending on the tooth." }
      ],
      "emergency_protocol": {
        "during_hours": "Book the next available emergency slot same day",
        "after_hours": "Take details, tell patient the clinic will call back first thing in the morning. For severe cases advise going to nearest hospital ER.",
        "emergency_contact": "+91-9876543210"
      },
      "calendar": {
        "provider": "google",
        "slot_duration_default": 30,
        "buffer_between_appointments": 15,
        "max_appointments_per_day": 20
      }
    }'::jsonb
);

-- ============================================================
-- SEED: Sample calls, leads, appointments so dashboard isn't empty
-- ============================================================

-- Get clinic id into a variable
DO $$
DECLARE
    v_clinic UUID;
    v_call1  UUID;
    v_call2  UUID;
    v_call3  UUID;
    v_lead1  UUID;
BEGIN
    SELECT id INTO v_clinic FROM clinics WHERE slug = 'sharma-dental';

    -- Call 1: appointment booked
    INSERT INTO calls (clinic_id, vapi_call_id, caller_phone, status, started_at, ended_at, duration_secs, outcome, cost_cents, summary, transcript)
    VALUES (
        v_clinic, 'vapi-demo-001', '+919876500001', 'completed',
        NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour 55 minutes', 285,
        'appointment_booked', 42,
        'Patient Rahul Sharma called for teeth cleaning. Appointment booked for tomorrow at 10 AM.',
        '[{"role":"assistant","content":"Thank you for calling Dr. Sharma Dental Care. This is Orvia, how can I help you?"},{"role":"user","content":"Hi, I want to book an appointment for teeth cleaning"},{"role":"assistant","content":"Of course! When would you like to come in?"},{"role":"user","content":"Tomorrow if possible"},{"role":"assistant","content":"We have availability tomorrow at 10 AM and 3 PM. Which works for you?"},{"role":"user","content":"10 AM is fine"},{"role":"assistant","content":"Perfect! May I have your name please?"},{"role":"user","content":"Rahul Sharma"},{"role":"assistant","content":"Wonderful, Rahul. Your appointment for Teeth Cleaning is confirmed for tomorrow at 10 AM. See you then!"}]'::jsonb
    ) RETURNING id INTO v_call1;

    -- Call 2: lead captured (missed appointment, patient not sure)
    INSERT INTO calls (clinic_id, vapi_call_id, caller_phone, status, started_at, ended_at, duration_secs, outcome, cost_cents, summary)
    VALUES (
        v_clinic, 'vapi-demo-002', '+919876500002', 'completed',
        NOW() - INTERVAL '5 hours', NOW() - INTERVAL '4 hours 55 minutes', 180,
        'lead_captured', 28,
        'Patient Priya asked about braces pricing. Interested in consultation. Lead captured.'
    ) RETURNING id INTO v_call2;

    -- Call 3: info given
    INSERT INTO calls (clinic_id, vapi_call_id, caller_phone, status, started_at, ended_at, duration_secs, outcome, cost_cents, summary)
    VALUES (
        v_clinic, 'vapi-demo-003', '+919876500003', 'completed',
        NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours 57 minutes', 120,
        'info_given', 18,
        'Patient asked about operating hours and location. Provided information, no appointment needed.'
    ) RETURNING id INTO v_call3;

    -- Lead from call 2
    INSERT INTO leads (clinic_id, call_id, name, phone, service_needed, urgency, notes, status)
    VALUES (v_clinic, v_call2, 'Priya Mehta', '+919876500002', 'Braces / Orthodontics', 'routine',
        'Interested in ceramic braces. Has consulted before but never moved forward. Follow up recommended.', 'new')
    RETURNING id INTO v_lead1;

    -- Appointment from call 1
    INSERT INTO appointments (clinic_id, call_id, patient_name, patient_phone, service_type, scheduled_start, scheduled_end, status)
    VALUES (
        v_clinic, v_call1, 'Rahul Sharma', '+919876500001', 'Teeth Cleaning / Scaling',
        NOW() + INTERVAL '1 day' - INTERVAL '14 hours',
        NOW() + INTERVAL '1 day' - INTERVAL '13 hours 15 minutes',
        'confirmed'
    );
END $$;

-- ============================================================
-- DONE. Now go to:
-- Authentication > Users > Add User
-- Create: afnan@icamxperts.com with a password
-- Then run the link-user query below with the new user's UUID.
-- ============================================================

-- ─── STEP 2 (run after creating the auth user) ───────────────
-- Replace <YOUR-AUTH-USER-UUID> with the UUID from the Auth dashboard.
--
-- INSERT INTO users (id, clinic_id, email, full_name, role)
-- SELECT
--   '<YOUR-AUTH-USER-UUID>'::uuid,
--   id,
--   'afnan@icamxperts.com',
--   'Afnan',
--   'owner'
-- FROM clinics WHERE slug = 'sharma-dental';
