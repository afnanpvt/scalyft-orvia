-- Migration 018: support for the Orvia Android app
--
--   * businesses.ai_number      the E.164 line owners forward their calls to
--   * mobile_devices            one row per app install (push token, self-reported
--                               forwarding state). Written only through RPCs.
--   * register_mobile_device()  upsert the caller's install
--   * unregister_mobile_device()
--   * mobile_overview()         one round trip for the app's home screen
--
-- Every function revokes the default EXECUTE grant: Supabase hands new
-- functions to anon and authenticated automatically, so a bare REVOKE FROM
-- PUBLIC is not enough.

BEGIN;

-- ── The line to forward to ─────────────────────────────────────────────────
-- phone_display is free text for humans. Forwarding needs a dial-able number,
-- so it gets its own column. Clients cannot write it (see 017's column grants);
-- provisioning sets it with the service role.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS ai_number TEXT
  CHECK (ai_number IS NULL OR ai_number ~ '^\+[1-9][0-9]{6,14}$');

COMMENT ON COLUMN businesses.ai_number IS
  'E.164 number of the Orvia line. The mobile app sets conditional call forwarding from the owner''s SIM to this number.';

-- ── mobile_devices ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mobile_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL CHECK (installation_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  platform        TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android')),
  push_token      TEXT,
  app_version     TEXT,
  -- Informational and self-reported by the app (mode, status, ring seconds).
  -- Never use it to make a security or billing decision.
  forwarding      JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, installation_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_push_token_unique
  ON mobile_devices (push_token) WHERE push_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mobile_devices_business ON mobile_devices (business_id);

ALTER TABLE mobile_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mobile_devices_select_own" ON mobile_devices;
CREATE POLICY "mobile_devices_select_own" ON mobile_devices
  FOR SELECT USING (user_id = auth.uid());

REVOKE ALL ON mobile_devices FROM anon;
REVOKE INSERT, UPDATE, DELETE ON mobile_devices FROM authenticated;

-- ── register_mobile_device ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION register_mobile_device(
  p_installation_id TEXT,
  p_push_token      TEXT,
  p_app_version     TEXT,
  p_forwarding      JSONB
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_biz UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_installation_id IS NULL OR p_installation_id !~ '^[A-Za-z0-9_-]{16,64}$' THEN
    RAISE EXCEPTION 'invalid installation id' USING ERRCODE = '22023';
  END IF;
  IF p_push_token IS NOT NULL AND length(p_push_token) > 4096 THEN
    RAISE EXCEPTION 'push token too long' USING ERRCODE = '22023';
  END IF;
  IF p_app_version IS NOT NULL AND length(p_app_version) > 32 THEN
    RAISE EXCEPTION 'app version too long' USING ERRCODE = '22023';
  END IF;
  IF p_forwarding IS NOT NULL AND (jsonb_typeof(p_forwarding) <> 'object' OR pg_column_size(p_forwarding) > 2048) THEN
    RAISE EXCEPTION 'forwarding must be a small object' USING ERRCODE = '22023';
  END IF;

  SELECT business_id INTO v_biz FROM users WHERE id = v_uid;
  IF v_biz IS NULL THEN
    RAISE EXCEPTION 'no business for this user' USING ERRCODE = '42501';
  END IF;

  -- A push token belongs to one install. If the phone changed hands (sign out,
  -- sign in as someone else) the old row must stop receiving pushes.
  IF p_push_token IS NOT NULL THEN
    UPDATE mobile_devices SET push_token = NULL
     WHERE push_token = p_push_token
       AND NOT (user_id = v_uid AND installation_id = p_installation_id);
  END IF;

  INSERT INTO mobile_devices (business_id, user_id, installation_id, push_token, app_version, forwarding)
  VALUES (v_biz, v_uid, p_installation_id, p_push_token, p_app_version, COALESCE(p_forwarding, '{}'::jsonb))
  ON CONFLICT (user_id, installation_id) DO UPDATE
     SET business_id  = EXCLUDED.business_id,
         push_token   = EXCLUDED.push_token,
         app_version  = EXCLUDED.app_version,
         forwarding   = COALESCE(p_forwarding, mobile_devices.forwarding),
         last_seen_at = now();

  -- An uninstalled app never unregisters. Forget this user's installs that
  -- have been silent for 60 days, and keep at most 10 so a script inventing
  -- installation ids cannot grow the table.
  DELETE FROM mobile_devices
   WHERE user_id = v_uid
     AND (last_seen_at < now() - interval '60 days'
          OR id IN (SELECT id FROM mobile_devices WHERE user_id = v_uid
                     ORDER BY last_seen_at DESC, created_at DESC OFFSET 10));
END;
$$;

CREATE OR REPLACE FUNCTION unregister_mobile_device(p_installation_id TEXT) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM mobile_devices WHERE user_id = auth.uid() AND installation_id = p_installation_id;
$$;

-- ── mobile_overview ────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: it reads through RLS, so it can only ever
-- describe the caller's own business.
CREATE OR REPLACE FUNCTION mobile_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  biz        businesses%ROWTYPE;
  tz         TEXT;
  day_start  TIMESTAMPTZ;
  live       RECORD;
BEGIN
  SELECT * INTO biz FROM businesses LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  tz := COALESCE(NULLIF(biz.timezone, ''), 'UTC');
  BEGIN
    day_start := date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz;
  EXCEPTION WHEN invalid_parameter_value THEN
    tz := 'UTC';
    day_start := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  END;

  SELECT id, caller_phone, started_at INTO live
    FROM calls
   WHERE status = 'in_progress' AND created_at > now() - interval '30 minutes'
   ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'business', jsonb_build_object(
      'id', biz.id,
      'name', biz.name,
      'status', biz.status,
      'timezone', tz,
      'seconds_remaining', biz.seconds_remaining,
      'allow_overage', biz.allow_overage,
      'ai_number', biz.ai_number,
      'phone_display', biz.phone_display
    ),
    'today', jsonb_build_object(
      'calls',        (SELECT count(*) FROM calls        WHERE created_at >= day_start),
      'missed',       (SELECT count(*) FROM calls        WHERE created_at >= day_start AND status IN ('missed', 'failed')),
      'appointments', (SELECT count(*) FROM appointments WHERE created_at >= day_start),
      'leads',        (SELECT count(*) FROM leads        WHERE created_at >= day_start)
    ),
    'upcoming_appointments', (SELECT count(*) FROM appointments
                               WHERE status IN ('confirmed', 'rescheduled')
                                 AND scheduled_start >= now()
                                 AND scheduled_start < now() + interval '7 days'),
    'pending_followups',     (SELECT count(*) FROM call_queue WHERE status = 'pending'),
    'unresolved_events',     (SELECT count(*) FROM operational_events WHERE resolved = false),
    'last_call_at',          (SELECT max(created_at) FROM calls),
    'live_call', CASE WHEN live.id IS NULL THEN NULL
                      ELSE jsonb_build_object('id', live.id, 'caller_phone', live.caller_phone, 'started_at', live.started_at) END,
    'server_time', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION register_mobile_device(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION unregister_mobile_device(TEXT)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mobile_overview()                                FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION register_mobile_device(TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION unregister_mobile_device(TEXT)                   TO authenticated;
GRANT EXECUTE ON FUNCTION mobile_overview()                                TO authenticated;

-- ── patch_business_settings ────────────────────────────────────────────────
-- The app edits three settings. Merging them server-side, inside one locked
-- transaction, means a phone never has to read the whole settings object and
-- write it back (which could silently undo a change made on the dashboard).
-- SECURITY INVOKER: it can only touch the caller's own business, and the
-- model_config guard from 017 still applies.
CREATE OR REPLACE FUNCTION patch_business_settings(p_patch JSONB) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  allowed CONSTANT TEXT[] := ARRAY['greeting', 'transfer_number', 'notification_phone'];
  k    TEXT;
  v    JSONB;
  biz  UUID;
  next JSONB;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'patch must be an object' USING ERRCODE = '22023';
  END IF;

  FOR k, v IN SELECT * FROM jsonb_each(p_patch) LOOP
    IF NOT (k = ANY (allowed)) THEN
      RAISE EXCEPTION 'setting "%" cannot be changed from the app', k USING ERRCODE = '22023';
    END IF;
    IF v <> 'null'::jsonb THEN
      IF jsonb_typeof(v) <> 'string' THEN
        RAISE EXCEPTION '"%" must be text', k USING ERRCODE = '22023';
      END IF;
      IF k = 'greeting' AND length(v #>> '{}') > 500 THEN
        RAISE EXCEPTION 'greeting is too long (500 characters at most)' USING ERRCODE = '22023';
      END IF;
      IF k IN ('transfer_number', 'notification_phone')
         AND (v #>> '{}') <> ''
         AND (v #>> '{}') !~ '^\+[1-9][0-9]{6,14}$' THEN
        RAISE EXCEPTION '"%" must be an international number like +919876543210', k USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  SELECT id, COALESCE(settings, '{}'::jsonb) INTO biz, next FROM businesses LIMIT 1 FOR UPDATE;
  IF biz IS NULL THEN
    RAISE EXCEPTION 'no business for this user' USING ERRCODE = '42501';
  END IF;

  FOR k, v IN SELECT * FROM jsonb_each(p_patch) LOOP
    IF v = 'null'::jsonb OR (v #>> '{}') = '' THEN
      next := next - k;            -- null or empty clears the setting
    ELSE
      next := next || jsonb_build_object(k, v);
    END IF;
  END LOOP;

  UPDATE businesses SET settings = next, updated_at = now() WHERE id = biz;
END;
$$;

REVOKE ALL ON FUNCTION patch_business_settings(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION patch_business_settings(JSONB) TO authenticated;

COMMIT;
