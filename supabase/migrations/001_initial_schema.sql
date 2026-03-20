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

-- ============================================================
-- REALTIME (enable for live dashboard updates)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE calls;
