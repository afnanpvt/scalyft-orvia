-- Migration 017: client hardening
--
-- Everything below the browser/phone boundary is public: the anon key ships
-- inside the web bundle and inside every APK, and either can be pulled apart.
-- Row-level security decides WHICH rows a signed-in user can touch, but the
-- original policies were `FOR ALL` with no column limits, which let any
-- authenticated user:
--   * UPDATE users SET role = 'admin'         (admin_business_id() trusts that column)
--   * UPDATE users SET business_id = <other>  (reads and writes another tenant)
--   * UPDATE businesses SET seconds_remaining / allow_overage / status /
--     vapi_phone_id / vapi_assistant_id        (free minutes, hijack a number)
--   * INSERT / DELETE calls, leads and appointments directly
--   * call deduct_call_seconds() with any amount
--
-- This migration keeps every write the dashboard actually performs and removes
-- the rest. Server-side code (edge functions) uses the service role, which
-- bypasses RLS and these grants, so it is unaffected.
--
-- Column grants are applied only to columns that exist, because the live
-- schema has drifted from the repo (users.theme_preference has no migration).

BEGIN;

-- ── helper: grant UPDATE on the listed columns that exist ──────────────────
CREATE OR REPLACE FUNCTION pg_temp.grant_update_cols(tbl text, cols text[]) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  present text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO present
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = tbl AND column_name = ANY (cols);
  IF present IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.%I TO authenticated', present, tbl);
  END IF;
END;
$$;

-- ── users ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_record" ON users;
DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

REVOKE ALL ON users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON users FROM authenticated;
SELECT pg_temp.grant_update_cols('users', ARRAY['full_name', 'theme_preference', 'must_change_password']);

-- ── businesses ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_business" ON businesses;
DROP POLICY IF EXISTS "businesses_select_own" ON businesses;
CREATE POLICY "businesses_select_own" ON businesses
  FOR SELECT USING (id IN (SELECT business_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "businesses_update_own" ON businesses;
CREATE POLICY "businesses_update_own" ON businesses
  FOR UPDATE
  USING (id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  WITH CHECK (id IN (SELECT business_id FROM users WHERE id = auth.uid()));

REVOKE ALL ON businesses FROM anon;
REVOKE INSERT, UPDATE, DELETE ON businesses FROM authenticated;
SELECT pg_temp.grant_update_cols('businesses', ARRAY['name', 'phone_display', 'settings', 'updated_at']);

-- settings.model_config picks the LLM/voice stack (and so the cost per minute).
-- It is an admin tool; owners keep write access to the rest of settings.
CREATE OR REPLACE FUNCTION guard_business_admin_settings() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- auth.uid() is null for the service role and for SQL run by an operator.
  IF auth.uid() IS NOT NULL
     AND NEW.settings->'model_config' IS DISTINCT FROM OLD.settings->'model_config'
     AND NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  THEN
    RAISE EXCEPTION 'model_config is admin-only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_guard_admin_settings ON businesses;
CREATE TRIGGER businesses_guard_admin_settings
  BEFORE UPDATE OF settings ON businesses
  FOR EACH ROW EXECUTE FUNCTION guard_business_admin_settings();

-- ── records written by the voice pipeline, only triaged by humans ──────────
-- calls, leads, appointments, call_queue, operational_events are created by
-- edge functions. Clients may change their status, nothing else.
REVOKE ALL ON calls, leads, appointments, call_queue, operational_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON calls, leads, appointments, call_queue, operational_events FROM authenticated;

SELECT pg_temp.grant_update_cols('calls',              ARRAY['status']);
SELECT pg_temp.grant_update_cols('leads',              ARRAY['status', 'notes', 'updated_at']);
SELECT pg_temp.grant_update_cols('appointments',       ARRAY['status', 'notes', 'updated_at']);
SELECT pg_temp.grant_update_cols('call_queue',         ARRAY['status', 'handled_at']);
SELECT pg_temp.grant_update_cols('operational_events', ARRAY['resolved']);

-- ── billing function ───────────────────────────────────────────────────────
-- Was callable by everyone with any amount (including negative).
REVOKE ALL ON FUNCTION deduct_call_seconds(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION deduct_call_seconds(UUID, INTEGER) TO service_role;

COMMIT;
