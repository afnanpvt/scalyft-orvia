-- Demo autofill: keeps demo dashboards looking alive by generating realistic
-- call activity twice a day. Only touches businesses with
-- settings.demo_autofill = true. Every generated call carries
-- extracted_data.demo_seed = true (appointments/leads link to those calls),
-- so it can all be removed with one query and is auto-pruned after 21 days.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Generates p_count calls with timestamps spread across [p_from, p_to], each
-- with an outcome, and the matching appointment or lead. Services come from
-- the business's own settings so a plumbing demo gets plumbing calls.
CREATE OR REPLACE FUNCTION generate_demo_activity(
  p_business uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_count int
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  biz record;
  tz text;
  first_names text[] := ARRAY['Aarav','Priya','Rohan','Ananya','Vikram','Sneha','Karthik','Divya','Arjun','Meera','Rahul','Kavya','Sanjay','Pooja','Nikhil','Lakshmi','Aditya','Shreya','Manoj','Deepa','Farhan','Ayesha','Suresh','Nandini','Harish','Ritu','Imran','Swati'];
  last_names text[] := ARRAY['Sharma','Reddy','Iyer','Nair','Gowda','Patel','Menon','Rao','Khan','Joshi','Kulkarni','Shetty','Hegde','Pillai','Verma','Das'];
  svc_names text[];
  svc_durations int[];
  svc_bookable boolean[];
  info_q text[] := ARRAY['Asked about timings on Sunday','Asked if they accept insurance','Asked about parking nearby','Asked for a price range','Asked how long a visit usually takes'];
  i int; si int; r float; tries int;
  call_ts timestamptz; dur int; cid uuid;
  fname text; lname text; phone text; outcome text; svc text; svc_dur int; bookable boolean;
  slot timestamptz; summ text; created int := 0;
BEGIN
  SELECT id, name, timezone, settings INTO biz FROM businesses WHERE id = p_business;
  IF biz.id IS NULL OR p_to <= p_from OR p_count <= 0 THEN RETURN 0; END IF;
  tz := COALESCE(biz.timezone, 'America/Chicago');

  SELECT array_agg(s->>'name'), array_agg(COALESCE((s->>'duration_minutes')::int, 30)), array_agg(COALESCE((s->>'can_book_directly')::boolean, true))
    INTO svc_names, svc_durations, svc_bookable
    FROM jsonb_array_elements(COALESCE(biz.settings->'service_details', '[]'::jsonb)) s
    WHERE s->>'name' IS NOT NULL;
  IF svc_names IS NULL THEN
    svc_names := ARRAY['Consultation','Routine service','Follow-up visit'];
    svc_durations := ARRAY[30,45,30];
    svc_bookable := ARRAY[true,true,true];
  END IF;

  FOR i IN 1..p_count LOOP
    call_ts := p_from + (random() * (p_to - p_from));
    fname := first_names[1 + floor(random() * array_length(first_names, 1))::int];
    lname := last_names[1 + floor(random() * array_length(last_names, 1))::int];
    phone := '+91 9' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0');
    si := 1 + floor(random() * array_length(svc_names, 1))::int;
    svc := svc_names[si]; svc_dur := svc_durations[si]; bookable := svc_bookable[si];

    r := random();
    outcome := CASE WHEN r < 0.46 THEN 'appointment_booked' WHEN r < 0.66 THEN 'lead_captured'
                    WHEN r < 0.9 THEN 'info_given' WHEN r < 0.95 THEN 'transferred' ELSE 'missed' END;
    IF outcome = 'appointment_booked' AND NOT bookable THEN outcome := 'lead_captured'; END IF;

    dur := CASE WHEN outcome = 'missed' THEN 0 ELSE 60 + floor(random() * 180)::int END;
    summ := CASE outcome
      WHEN 'appointment_booked' THEN fname || ' booked ' || svc || '.'
      WHEN 'lead_captured' THEN fname || ' enquired about ' || svc || ' — callback requested.'
      WHEN 'info_given' THEN info_q[1 + floor(random() * array_length(info_q, 1))::int] || '.'
      WHEN 'transferred' THEN fname || ' asked to speak with the owner — transferred.'
      ELSE 'Missed call.' END;

    INSERT INTO calls (business_id, vapi_call_id, caller_phone, language_detected, status, started_at, ended_at,
                       duration_secs, transcript, summary, extracted_data, outcome, cost_cents, created_at, transcript_status)
    VALUES (
      p_business, 'demo-seed-' || gen_random_uuid(), phone,
      CASE WHEN random() < 0.3 THEN 'hi' ELSE 'en' END,
      CASE outcome WHEN 'missed' THEN 'missed' WHEN 'transferred' THEN 'transferred' ELSE 'completed' END,
      call_ts, call_ts + make_interval(secs => dur), dur,
      CASE WHEN outcome = 'missed' THEN NULL ELSE jsonb_build_array(
        jsonb_build_object('role','assistant','content','Thanks for calling ' || biz.name || ', how can I help you today?'),
        jsonb_build_object('role','user','content', CASE WHEN outcome = 'info_given' THEN 'Hi, I had a quick question.' ELSE 'Hi, I wanted to ask about ' || lower(svc) || '.' END),
        jsonb_build_object('role','assistant','content', CASE WHEN outcome = 'appointment_booked' THEN 'Sure — may I have your name and a preferred day?' WHEN outcome = 'lead_captured' THEN 'That one needs a consult first. Can I take your details for a callback?' ELSE 'Of course, happy to help with that.' END),
        jsonb_build_object('role','user','content', 'It''s ' || fname || ' ' || lname || '.'),
        jsonb_build_object('role','assistant','content', CASE WHEN outcome = 'appointment_booked' THEN 'You''re all set, ' || fname || '. See you soon!' WHEN outcome = 'lead_captured' THEN 'Thanks ' || fname || ', someone will call you back within 30 minutes.' ELSE 'Anything else I can help with?' END)
      ) END,
      summ,
      jsonb_build_object('caller_name', fname || ' ' || lname, 'service_needed', svc, 'demo_seed', true),
      outcome, (dur * 0.12)::int, call_ts,
      CASE WHEN outcome = 'missed' THEN 'pending' ELSE 'complete' END
    )
    RETURNING id INTO cid;
    created := created + 1;

    IF outcome = 'appointment_booked' THEN
      tries := 0;
      LOOP
        tries := tries + 1;
        slot := (date_trunc('day', call_ts AT TIME ZONE tz)
                 + make_interval(days => 1 + floor(random() * 5)::int, hours => 10 + floor(random() * 8)::int, mins => (floor(random() * 2) * 30)::int)
                ) AT TIME ZONE tz;
        BEGIN
          INSERT INTO appointments (business_id, call_id, customer_name, customer_phone, service_type,
                                    scheduled_start, scheduled_end, status, created_at)
          VALUES (p_business, cid, fname || ' ' || lname, phone, svc, slot, slot + make_interval(mins => svc_dur),
                  'confirmed', call_ts);
          EXIT;
        EXCEPTION WHEN exclusion_violation THEN
          IF tries > 20 THEN EXIT; END IF;
        END;
      END LOOP;
    ELSIF outcome = 'lead_captured' THEN
      INSERT INTO leads (business_id, call_id, name, phone, service_needed, urgency, notes, status, created_at, updated_at)
      VALUES (p_business, cid, fname || ' ' || lname, phone, svc,
              CASE WHEN random() < 0.15 THEN 'urgent' ELSE 'routine' END,
              'Requested a callback', 'new', call_ts, call_ts);
    END IF;
  END LOOP;

  RETURN created;
END;
$$;

-- Called by cron. For every opted-in business: roll past demo appointments
-- forward to completed/no-show, add a batch of calls covering the business
-- hours since the previous run (never future-dated), and prune old demo rows.
CREATE OR REPLACE FUNCTION run_demo_autofill() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    -- Calls land between 9am local (or 7h ago, whichever is later) and now.
    window_from := GREATEST(now() - interval '7 hours', (date_trunc('day', local_now) + interval '9 hours') AT TIME ZONE tz);
    window_to := LEAST(now(), (date_trunc('day', local_now) + interval '20 hours') AT TIME ZONE tz);

    IF window_to > window_from THEN
      PERFORM generate_demo_activity(biz.id, window_from, window_to, 3 + floor(random() * 5)::int);
    END IF;

    UPDATE appointments a SET status = CASE WHEN random() < 0.88 THEN 'completed' ELSE 'no_show' END
      FROM calls c
     WHERE a.call_id = c.id AND c.extracted_data->>'demo_seed' = 'true'
       AND a.business_id = biz.id AND a.status = 'confirmed' AND a.scheduled_end < now();

    DELETE FROM appointments WHERE call_id IN (
      SELECT id FROM calls WHERE business_id = biz.id AND extracted_data->>'demo_seed' = 'true' AND created_at < now() - interval '21 days');
    DELETE FROM leads WHERE call_id IN (
      SELECT id FROM calls WHERE business_id = biz.id AND extracted_data->>'demo_seed' = 'true' AND created_at < now() - interval '21 days');
    DELETE FROM calls WHERE business_id = biz.id AND extracted_data->>'demo_seed' = 'true' AND created_at < now() - interval '21 days';
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION generate_demo_activity(uuid, timestamptz, timestamptz, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION run_demo_autofill() FROM PUBLIC, anon, authenticated;

-- ── Admin controls (/admin/demo-data) ────────────────────────────────────
-- Each acts on the calling admin's own business and refuses non-admins.

CREATE OR REPLACE FUNCTION admin_business_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM users WHERE id = auth.uid() AND role = 'admin'
$$;

CREATE OR REPLACE FUNCTION admin_demo_stats() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  biz uuid := admin_business_id();
BEGIN
  IF biz IS NULL THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN jsonb_build_object(
    'autofill', (SELECT COALESCE((settings->>'demo_autofill')::boolean, false) FROM businesses WHERE id = biz),
    'calls', (SELECT count(*) FROM calls WHERE business_id = biz AND extracted_data->>'demo_seed' = 'true'),
    'appointments', (SELECT count(*) FROM appointments a JOIN calls c ON c.id = a.call_id
                      WHERE c.business_id = biz AND c.extracted_data->>'demo_seed' = 'true'),
    'leads', (SELECT count(*) FROM leads l JOIN calls c ON c.id = l.call_id
               WHERE c.business_id = biz AND c.extracted_data->>'demo_seed' = 'true'),
    'latest', (SELECT max(created_at) FROM calls WHERE business_id = biz AND extracted_data->>'demo_seed' = 'true')
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_demo_autofill(p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  biz uuid := admin_business_id();
BEGIN
  IF biz IS NULL THEN RAISE EXCEPTION 'admin only'; END IF;
  UPDATE businesses
     SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{demo_autofill}', to_jsonb(p_enabled)),
         updated_at = now()
   WHERE id = biz;
END;
$$;

-- Adds a batch spread over the last few hours (never future-dated).
CREATE OR REPLACE FUNCTION admin_generate_demo_now(p_count int DEFAULT 6) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  biz uuid := admin_business_id();
BEGIN
  IF biz IS NULL THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN generate_demo_activity(biz, now() - interval '6 hours', now() - interval '2 minutes', LEAST(GREATEST(p_count, 1), 30));
END;
$$;

CREATE OR REPLACE FUNCTION admin_clear_demo_data() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  biz uuid := admin_business_id();
  removed int;
BEGIN
  IF biz IS NULL THEN RAISE EXCEPTION 'admin only'; END IF;
  DELETE FROM appointments WHERE call_id IN (SELECT id FROM calls WHERE business_id = biz AND extracted_data->>'demo_seed' = 'true');
  DELETE FROM leads WHERE call_id IN (SELECT id FROM calls WHERE business_id = biz AND extracted_data->>'demo_seed' = 'true');
  DELETE FROM calls WHERE business_id = biz AND extracted_data->>'demo_seed' = 'true';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION admin_business_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_demo_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_set_demo_autofill(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_generate_demo_now(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_clear_demo_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_demo_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_demo_autofill(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_generate_demo_now(int) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_clear_demo_data() TO authenticated;

-- 07:30 and 14:30 UTC = 1:00 PM and 8:00 PM IST (the only opted-in business
-- is in Asia/Kolkata). Each run backfills the hours since the previous one.
SELECT cron.schedule('demo-autofill-midday', '30 7 * * *', 'SELECT run_demo_autofill()');
SELECT cron.schedule('demo-autofill-evening', '30 14 * * *', 'SELECT run_demo_autofill()');

COMMIT;
