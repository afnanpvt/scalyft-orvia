-- Demo alerts: the bell and "Needs attention" draw from call_queue and
-- operational_events, which generated data never touched — so demo accounts
-- always showed "All clear". sync_demo_alerts raises a few realistic items
-- from recent demo calls (missed → callback, one partial booking), and every
-- demo cleanup now removes alerts tied to demo calls first.

CREATE OR REPLACE FUNCTION delete_demo_rows(p_business uuid, p_older_than interval DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  removed int;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _demo_calls (id uuid) ON COMMIT DROP;
  DELETE FROM _demo_calls;
  INSERT INTO _demo_calls
    SELECT id FROM calls
     WHERE business_id = p_business AND extracted_data->>'demo_seed' = 'true'
       AND (p_older_than IS NULL OR created_at < now() - p_older_than);

  DELETE FROM call_queue WHERE call_id IN (SELECT id FROM _demo_calls);
  DELETE FROM operational_events WHERE call_id IN (SELECT id FROM _demo_calls);
  DELETE FROM appointments WHERE call_id IN (SELECT id FROM _demo_calls);
  DELETE FROM leads WHERE call_id IN (SELECT id FROM _demo_calls);
  DELETE FROM calls WHERE id IN (SELECT id FROM _demo_calls);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

CREATE OR REPLACE FUNCTION sync_demo_alerts(p_business uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
BEGIN
  -- Missed demo calls from the last 2 days → callback queue (max 2 open).
  FOR c IN
    SELECT id, caller_phone, extracted_data->>'caller_name' AS name, extracted_data->>'service_needed' AS svc
      FROM calls
     WHERE business_id = p_business AND extracted_data->>'demo_seed' = 'true'
       AND outcome = 'missed' AND created_at > now() - interval '2 days'
       AND NOT EXISTS (SELECT 1 FROM call_queue q WHERE q.call_id = calls.id)
     ORDER BY created_at DESC
     LIMIT GREATEST(0, 2 - (SELECT count(*) FROM call_queue q JOIN calls dc ON dc.id = q.call_id
                             WHERE q.business_id = p_business AND q.status = 'pending'
                               AND q.queue_type = 'missed_callback' AND dc.extracted_data->>'demo_seed' = 'true'))
  LOOP
    INSERT INTO call_queue (business_id, call_id, queue_type, priority, caller_phone, caller_name, service_needed, status, created_at)
    VALUES (p_business, c.id, 'missed_callback', 5, c.caller_phone, NULL, NULL, 'pending', now());
  END LOOP;

  -- One recent demo lead → partial booking (caller wanted a time but didn't finish).
  IF NOT EXISTS (
    SELECT 1 FROM call_queue q JOIN calls dc ON dc.id = q.call_id
     WHERE q.business_id = p_business AND q.status = 'pending' AND q.queue_type = 'partial_booking'
       AND dc.extracted_data->>'demo_seed' = 'true'
  ) THEN
    SELECT id, caller_phone, extracted_data->>'caller_name' AS name, extracted_data->>'service_needed' AS svc
      INTO c
      FROM calls
     WHERE business_id = p_business AND extracted_data->>'demo_seed' = 'true'
       AND outcome = 'lead_captured' AND created_at > now() - interval '1 day'
       AND NOT EXISTS (SELECT 1 FROM call_queue q WHERE q.call_id = calls.id)
     ORDER BY created_at DESC LIMIT 1;
    IF c.id IS NOT NULL THEN
      INSERT INTO call_queue (business_id, call_id, queue_type, priority, caller_phone, caller_name, service_needed, status, created_at)
      VALUES (p_business, c.id, 'partial_booking', 3, c.caller_phone, c.name, c.svc, 'pending', now());
      INSERT INTO operational_events (business_id, call_id, event_type, severity, payload)
      VALUES (p_business, c.id, 'partial_booking', 'warning',
              jsonb_build_object('caller_phone', c.caller_phone, 'caller_name', c.name, 'service_needed', c.svc, 'demo_seed', true));
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_clear_demo_data() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  biz uuid := admin_business_id();
BEGIN
  IF biz IS NULL THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN delete_demo_rows(biz);
END;
$$;

CREATE OR REPLACE FUNCTION admin_generate_demo_now(p_count int DEFAULT 6) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  biz uuid := admin_business_id();
  created int;
BEGIN
  IF biz IS NULL THEN RAISE EXCEPTION 'admin only'; END IF;
  created := generate_demo_activity(biz, now() - interval '6 hours', now() - interval '2 minutes', LEAST(GREATEST(p_count, 1), 30));
  PERFORM sync_demo_alerts(biz);
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION admin_regenerate_demo_week() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  biz uuid := admin_business_id();
  tz text;
  d int; day_start timestamptz; wfrom timestamptz; wto timestamptz;
  total int := 0;
BEGIN
  IF biz IS NULL THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT COALESCE(timezone, 'America/Chicago') INTO tz FROM businesses WHERE id = biz;
  PERFORM delete_demo_rows(biz);

  FOR d IN REVERSE 29..0 LOOP
    day_start := (date_trunc('day', now() AT TIME ZONE tz) - make_interval(days => d)) AT TIME ZONE tz;
    wfrom := day_start + interval '9 hours';
    wto := LEAST(day_start + interval '20 hours', now() - interval '5 minutes');
    IF wto > wfrom THEN
      total := total + generate_demo_activity(
        biz, wfrom, wto,
        CASE WHEN d < 7 THEN 6 + floor(random() * 7)::int ELSE 2 + floor(random() * 4)::int END);
    END IF;
  END LOOP;
  PERFORM sync_demo_alerts(biz);
  RETURN total;
END;
$$;

CREATE OR REPLACE FUNCTION run_demo_autofill() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  biz record;
  tz text;
  local_now timestamp;
  window_from timestamptz;
  window_to timestamptz;
BEGIN
  FOR biz IN SELECT id, timezone FROM businesses WHERE settings->>'demo_autofill' = 'true' LOOP
    tz := COALESCE(biz.timezone, 'America/Chicago');
    local_now := now() AT TIME ZONE tz;

    window_from := GREATEST(now() - interval '7 hours', (date_trunc('day', local_now) + interval '9 hours') AT TIME ZONE tz);
    window_to := LEAST(now(), (date_trunc('day', local_now) + interval '20 hours') AT TIME ZONE tz);

    IF window_to > window_from THEN
      PERFORM generate_demo_activity(biz.id, window_from, window_to, 3 + floor(random() * 5)::int);
    END IF;

    UPDATE appointments a SET status = CASE WHEN random() < 0.88 THEN 'completed' ELSE 'no_show' END
      FROM calls c
     WHERE a.call_id = c.id AND c.extracted_data->>'demo_seed' = 'true'
       AND a.business_id = biz.id AND a.status = 'confirmed' AND a.scheduled_end < now();

    PERFORM delete_demo_rows(biz.id, interval '35 days');
    PERFORM sync_demo_alerts(biz.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION delete_demo_rows(uuid, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_demo_alerts(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION run_demo_autofill() FROM PUBLIC, anon, authenticated;
