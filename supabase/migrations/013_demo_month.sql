-- Demo data covers a full month: the niche switcher now regenerates 30 days
-- (busier last week, lighter before that — ~70% of a 300-minute plan used by
-- month end), and autofill keeps 35 days before pruning.

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

  DELETE FROM appointments WHERE call_id IN (SELECT id FROM calls WHERE business_id = biz AND extracted_data->>'demo_seed' = 'true');
  DELETE FROM leads WHERE call_id IN (SELECT id FROM calls WHERE business_id = biz AND extracted_data->>'demo_seed' = 'true');
  DELETE FROM calls WHERE business_id = biz AND extracted_data->>'demo_seed' = 'true';

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
  RETURN total;
END;
$$;

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
      SELECT id FROM calls WHERE business_id = biz.id AND extracted_data->>'demo_seed' = 'true' AND created_at < now() - interval '35 days');
    DELETE FROM leads WHERE call_id IN (
      SELECT id FROM calls WHERE business_id = biz.id AND extracted_data->>'demo_seed' = 'true' AND created_at < now() - interval '35 days');
    DELETE FROM calls WHERE business_id = biz.id AND extracted_data->>'demo_seed' = 'true' AND created_at < now() - interval '35 days';
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION run_demo_autofill() FROM PUBLIC, anon, authenticated;
