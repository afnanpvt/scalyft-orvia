-- Migration 002: Rename clinics → businesses
-- • clinic_id → business_id throughout
-- • patient_name/phone → customer_name/phone in appointments
-- • language_detected CHECK extended to include Spanish ('es')
-- • timezone default corrected to America/Chicago
-- • UNIQUE index on vapi_phone_id
-- • RLS policies and indexes rebuilt with new names

BEGIN;

-- 1. Rename the table
ALTER TABLE clinics RENAME TO businesses;

-- 2. Rename foreign key columns on all child tables
ALTER TABLE users        RENAME COLUMN clinic_id TO business_id;
ALTER TABLE calls        RENAME COLUMN clinic_id TO business_id;
ALTER TABLE leads        RENAME COLUMN clinic_id TO business_id;
ALTER TABLE appointments RENAME COLUMN clinic_id TO business_id;

-- 3. Rename patient fields in appointments
ALTER TABLE appointments RENAME COLUMN patient_name  TO customer_name;
ALTER TABLE appointments RENAME COLUMN patient_phone TO customer_phone;

-- 4. Correct timezone default for US market
ALTER TABLE businesses ALTER COLUMN timezone SET DEFAULT 'America/Chicago';

-- 5. Extend language_detected to include Spanish
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_language_detected_check;
ALTER TABLE calls ADD CONSTRAINT calls_language_detected_check
  CHECK (language_detected IN ('hi', 'en', 'es'));

-- 6. Unique index on vapi_phone_id (non-NULL only — allows unprovisioned rows)
CREATE UNIQUE INDEX businesses_vapi_phone_id_unique
  ON businesses(vapi_phone_id)
  WHERE vapi_phone_id IS NOT NULL;

-- 7. Update settings column comment
COMMENT ON COLUMN businesses.settings IS
  'JSONB: { greeting, hours, services[], languages[], emergency_number, calendar_id, transfer_number, service_area_zips[], notification_phone }';

-- 8. Drop old RLS policies
DROP POLICY IF EXISTS "users_own_clinic"      ON businesses;
DROP POLICY IF EXISTS "calls_own_clinic"      ON calls;
DROP POLICY IF EXISTS "leads_own_clinic"      ON leads;
DROP POLICY IF EXISTS "appointments_own_clinic" ON appointments;

-- 9. Recreate RLS policies with new column names
CREATE POLICY "users_own_business" ON businesses
  FOR ALL USING (
    id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "calls_own_business" ON calls
  FOR ALL USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "leads_own_business" ON leads
  FOR ALL USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "appointments_own_business" ON appointments
  FOR ALL USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );

-- 10. Drop old indexes and recreate with new names
DROP INDEX IF EXISTS idx_calls_clinic_created;
DROP INDEX IF EXISTS idx_leads_clinic_created;
DROP INDEX IF EXISTS idx_leads_clinic_status;
DROP INDEX IF EXISTS idx_appointments_clinic_start;
DROP INDEX IF EXISTS idx_users_clinic;

CREATE INDEX idx_calls_business_created    ON calls(business_id, created_at DESC);
CREATE INDEX idx_leads_business_created    ON leads(business_id, created_at DESC);
CREATE INDEX idx_leads_business_status     ON leads(business_id, status);
CREATE INDEX idx_appointments_business_start ON appointments(business_id, scheduled_start);
CREATE INDEX idx_users_business            ON users(business_id);

-- 11. Rename updated_at trigger on businesses table
DROP TRIGGER IF EXISTS clinics_updated_at ON businesses;
CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
