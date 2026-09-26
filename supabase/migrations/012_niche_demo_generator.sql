-- Niche- and region-aware demo generator (US names/+1 numbers for US
-- presets, industry-specific questions, real Sunday hours) plus
-- admin_regenerate_demo_week() for the /admin/niche switcher.

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
  agent text;
  first_names text[] := ARRAY['Aarav','Priya','Rohan','Ananya','Vikram','Sneha','Karthik','Divya','Arjun','Meera','Rahul','Kavya','Sanjay','Pooja','Nikhil','Lakshmi','Aditya','Shreya','Manoj','Deepa','Farhan','Ayesha','Suresh','Nandini','Harish','Ritu','Imran','Swati'];
  last_names text[] := ARRAY['Sharma','Reddy','Iyer','Nair','Gowda','Patel','Menon','Rao','Khan','Joshi','Kulkarni','Shetty','Hegde','Pillai','Verma','Das'];
  svc_names text[]; svc_durations int[]; svc_bookable boolean[]; svc_prices text[];
  i int; si int; r float; tries int; variant int;
  call_ts timestamptz; dur int; cid uuid;
  fname text; lname text; phone text; outcome text; svc text; svc_dur int; bookable boolean; price text;
  slot timestamptz; slot_day text; slot_time text; alt_time text; ask_day text;
  summ text; turns jsonb; created int := 0;
  address text;
  region text; niche text; staff_title text;
  info_q1 text; info_a1 text; price_phrase text;
  sun jsonb; sun_open boolean; sun_hours text;
  area_codes text[] := ARRAY['512','737','602','480','214','469'];
BEGIN
  SELECT id, name, timezone, settings INTO biz FROM businesses WHERE id = p_business;
  IF biz.id IS NULL OR p_to <= p_from OR p_count <= 0 THEN RETURN 0; END IF;
  tz := COALESCE(biz.timezone, 'America/Chicago');
  agent := COALESCE(NULLIF(biz.settings->>'receptionist_name', ''), 'Orvia');
  address := NULLIF(biz.settings->>'address', '');
  region := COALESCE(biz.settings->>'demo_region', 'in');
  niche := COALESCE(biz.settings->>'niche', '');

  IF region = 'us' THEN
    first_names := ARRAY['James','Emily','Michael','Sarah','David','Jessica','Chris','Ashley','Daniel','Megan','Matt','Lauren','Ryan','Rachel','Tyler','Amanda','Josh','Nicole','Brandon','Kayla','Kevin','Maria','Luis','Hannah','Eric','Olivia','Sam','Grace'];
    last_names := ARRAY['Johnson','Williams','Brown','Garcia','Miller','Davis','Martinez','Wilson','Anderson','Taylor','Thomas','Moore','Jackson','Martin','Lee','Harris','Clark','Lewis','Walker','Young'];
  END IF;

  staff_title := CASE niche
    WHEN 'dental' THEN 'the doctor'
    WHEN 'real_estate' THEN 'an agent'
    WHEN 'customer_support' THEN 'a supervisor'
    ELSE 'the owner' END;

  info_q1 := CASE niche
    WHEN 'plumbing' THEN 'Do you charge a trip fee to come out?'
    WHEN 'hvac' THEN 'Do you offer financing on new systems?'
    WHEN 'real_estate' THEN 'Do you help buyers with mortgages?'
    WHEN 'customer_support' THEN 'How do I change my Wi-Fi password?'
    ELSE 'Do you accept insurance?' END;
  info_a1 := CASE niche
    WHEN 'plumbing' THEN 'There''s a small service call fee, and it''s waived if you go ahead with the repair.'
    WHEN 'hvac' THEN 'We do, 0% financing for qualified buyers, and the estimate itself is free.'
    WHEN 'real_estate' THEN 'We work with trusted local lenders and can introduce you during a buyer consultation.'
    WHEN 'customer_support' THEN 'You can change it in the app under Wi-Fi settings, just tap Change password.'
    ELSE 'We work with most major insurance providers. Bring your card and the front desk will confirm your coverage.' END;

  sun := biz.settings->'operating_hours'->'sunday';
  sun_open := sun IS NOT NULL AND NOT COALESCE((sun->>'closed')::boolean, false) AND sun->>'open' IS NOT NULL;
  IF sun_open THEN
    sun_hours := to_char(('2000-01-01 ' || (sun->>'open'))::timestamp, 'FMHH12:MI AM') || ' to ' || to_char(('2000-01-01 ' || (sun->>'close'))::timestamp, 'FMHH12:MI AM');
  END IF;

  SELECT array_agg(s->>'name'),
         array_agg(COALESCE((s->>'duration_minutes')::int, 30)),
         array_agg(COALESCE((s->>'can_book_directly')::boolean, true)),
         array_agg(COALESCE(NULLIF(s->>'price_range', ''), 'a range'))
    INTO svc_names, svc_durations, svc_bookable, svc_prices
    FROM jsonb_array_elements(COALESCE(biz.settings->'service_details', '[]'::jsonb)) s
   WHERE s->>'name' IS NOT NULL;
  IF svc_names IS NULL THEN
    svc_names := ARRAY['Consultation','Routine service','Follow-up visit'];
    svc_durations := ARRAY[30,45,30];
    svc_bookable := ARRAY[true,true,true];
    svc_prices := ARRAY['a range','a range','a range'];
  END IF;

  FOR i IN 1..p_count LOOP
    call_ts := p_from + (random() * (p_to - p_from));
    fname := first_names[1 + floor(random() * array_length(first_names, 1))::int];
    lname := last_names[1 + floor(random() * array_length(last_names, 1))::int];
    phone := CASE WHEN region = 'us'
      THEN '+1 (' || area_codes[1 + floor(random() * array_length(area_codes, 1))::int] || ') 555-' || lpad(floor(random() * 10000)::int::text, 4, '0')
      ELSE '+91 9' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0') END;
    si := 1 + floor(random() * array_length(svc_names, 1))::int;
    svc := svc_names[si]; svc_dur := svc_durations[si]; bookable := svc_bookable[si]; price := svc_prices[si];
    variant := floor(random() * 3)::int;
    price_phrase := CASE WHEN lower(price) = 'free' THEN 'is completely free' ELSE 'usually ranges from ' || price END;

    r := random();
    outcome := CASE WHEN r < 0.46 THEN 'appointment_booked' WHEN r < 0.66 THEN 'lead_captured'
                    WHEN r < 0.9 THEN 'info_given' WHEN r < 0.95 THEN 'transferred' ELSE 'missed' END;
    IF outcome = 'appointment_booked' AND NOT bookable THEN outcome := 'lead_captured'; END IF;

    -- Pick a free slot up front so the conversation can quote it.
    slot := NULL;
    IF outcome = 'appointment_booked' THEN
      FOR tries IN 1..25 LOOP
        slot := (date_trunc('day', call_ts AT TIME ZONE tz)
                 + make_interval(days => 1 + floor(random() * 5)::int, hours => 10 + floor(random() * 8)::int, mins => (floor(random() * 2) * 30)::int)
                ) AT TIME ZONE tz;
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM appointments a
           WHERE a.business_id = p_business AND a.status IN ('confirmed','rescheduled')
             AND tstzrange(a.scheduled_start, a.scheduled_end, '[)') && tstzrange(slot, slot + make_interval(mins => svc_dur), '[)'));
        slot := NULL;
      END LOOP;
      IF slot IS NULL THEN outcome := 'lead_captured'; END IF;
    END IF;

    IF slot IS NOT NULL THEN
      slot_day := to_char(slot AT TIME ZONE tz, 'FMDay, FMMonth FMDD');
      slot_time := to_char(slot AT TIME ZONE tz, 'FMHH12:MI AM');
      alt_time := to_char((slot - interval '90 minutes') AT TIME ZONE tz, 'FMHH12:MI AM');
      ask_day := CASE variant
        WHEN 0 THEN 'Do you have anything on ' || to_char(slot AT TIME ZONE tz, 'FMDay') || '?'
        WHEN 1 THEN 'Anything later this week works for me.'
        ELSE 'Is ' || to_char(slot AT TIME ZONE tz, 'FMDay') || ' ' || CASE WHEN extract(hour FROM slot AT TIME ZONE tz) < 13 THEN 'morning' ELSE 'afternoon' END || ' possible?' END;
    END IF;

    turns := CASE outcome
      WHEN 'appointment_booked' THEN jsonb_build_array(
        jsonb_build_object('role','assistant','content','Thanks for calling ' || biz.name || ', this is ' || agent || '. Just so you know, this call may be recorded. How can I help you today?'),
        jsonb_build_object('role','user','content', CASE variant WHEN 0 THEN 'Hi, I''d like to book a ' || lower(svc) || ' appointment.' WHEN 1 THEN 'Hello, I wanted to come in for ' || lower(svc) || '. Do you have any openings?' ELSE 'Hi, I need to schedule ' || lower(svc) || ', please.' END),
        jsonb_build_object('role','assistant','content','Of course, I can get that set up. Did you have a day in mind?'),
        jsonb_build_object('role','user','content', ask_day),
        jsonb_build_object('role','assistant','content','Let me check. I have ' || slot_day || ' at either ' || alt_time || ' or ' || slot_time || '. Which works better for you?'),
        jsonb_build_object('role','user','content', slot_time || ' is good.'),
        jsonb_build_object('role','assistant','content','Perfect. Can I get your full name, please?'),
        jsonb_build_object('role','user','content','Sure, it''s ' || fname || ' ' || lname || '.'),
        jsonb_build_object('role','assistant','content','Thanks, ' || fname || '. And the best number to reach you on?'),
        jsonb_build_object('role','user','content', phone),
        jsonb_build_object('role','assistant','content','You''re all set: ' || svc || ' on ' || slot_day || ' at ' || slot_time || '. You''ll get a confirmation text shortly. Anything else I can help with?'),
        jsonb_build_object('role','user','content', CASE variant WHEN 0 THEN 'No, that''s everything. Thank you!' WHEN 1 THEN 'That''s it, thanks so much.' ELSE 'Nope, all good. Thanks!' END),
        jsonb_build_object('role','assistant','content','Great, see you then, ' || fname || '. Have a lovely day!'))
      WHEN 'lead_captured' THEN jsonb_build_array(
        jsonb_build_object('role','assistant','content','Thanks for calling ' || biz.name || ', this is ' || agent || '. How can I help you today?'),
        jsonb_build_object('role','user','content', CASE variant WHEN 0 THEN 'Hi, I wanted to ask about ' || lower(svc) || '. Roughly how much does it cost?' WHEN 1 THEN 'Hello, I''ve been thinking about ' || lower(svc) || '. What''s the process like?' ELSE 'Hi, can you tell me a bit about ' || lower(svc) || '?' END),
        jsonb_build_object('role','assistant','content', CASE WHEN lower(price) = 'free'
          THEN svc || ' is completely free. The right person on the team will want to talk it through with you first.'
          ELSE svc || ' usually ranges from ' || price || ', depending on what''s needed. The team would want to take a proper look first so they can give you an exact plan.' END),
        jsonb_build_object('role','user','content','Okay, that makes sense. Could someone call me back to go over it?'),
        jsonb_build_object('role','assistant','content','Absolutely. May I have your name?'),
        jsonb_build_object('role','user','content', fname || ' ' || lname || '.'),
        jsonb_build_object('role','assistant','content','Thanks, ' || fname || '. What''s the best number to reach you?'),
        jsonb_build_object('role','user','content', phone),
        jsonb_build_object('role','assistant','content','Got it. Someone from the team will call you back within 30 minutes. Is there anything else I can note down for them?'),
        jsonb_build_object('role','user','content', CASE variant WHEN 0 THEN 'No, that''s all. Thanks.' WHEN 1 THEN 'Just that evenings are easier for me.' ELSE 'No, thank you.' END),
        jsonb_build_object('role','assistant','content','Noted. Thanks for calling, ' || fname || '. Talk soon!'))
      WHEN 'info_given' THEN CASE variant
        WHEN 0 THEN jsonb_build_array(
          jsonb_build_object('role','assistant','content','Thanks for calling ' || biz.name || ', this is ' || agent || '. How can I help?'),
          jsonb_build_object('role','user','content','Hi, are you open on Sundays?'),
          jsonb_build_object('role','assistant','content', CASE WHEN sun_open
            THEN 'We are, Sundays from ' || sun_hours || '. Would you like me to book something in?'
            ELSE 'We''re closed on Sundays, but open the rest of the week. Would you like me to book you in for another day?' END),
          jsonb_build_object('role','user','content','Not right now, I just wanted to check before I plan my week.'),
          jsonb_build_object('role','assistant','content','Of course. Call back any time and I''ll get you sorted.'),
          jsonb_build_object('role','user','content','Perfect, thanks.'),
          jsonb_build_object('role','assistant','content','You''re welcome. Have a great day!'))
        WHEN 1 THEN jsonb_build_array(
          jsonb_build_object('role','assistant','content','Thanks for calling ' || biz.name || ', this is ' || agent || '. How can I help?'),
          jsonb_build_object('role','user','content','Hi, quick question. ' || info_q1),
          jsonb_build_object('role','assistant','content', info_a1),
          jsonb_build_object('role','user','content','Okay, good to know. And how much is ' || lower(svc) || '?'),
          jsonb_build_object('role','assistant','content','It ' || price_phrase || '. Would you like me to find you a time?'),
          jsonb_build_object('role','user','content','Not yet, I''ll call back once I''ve thought about it.'),
          jsonb_build_object('role','assistant','content','Sounds good. We''ll be here whenever you''re ready. Take care!'))
        ELSE jsonb_build_array(
          jsonb_build_object('role','assistant','content','Thanks for calling ' || biz.name || ', this is ' || agent || '. How can I help?'),
          jsonb_build_object('role','user','content','Hi, where exactly are you located? And is there parking?'),
          jsonb_build_object('role','assistant','content', COALESCE('We''re at ' || address || '. ', 'We''re right on the main road. ') || 'There''s parking available right outside.'),
          jsonb_build_object('role','user','content','Great. How long does a ' || lower(svc) || ' usually take?'),
          jsonb_build_object('role','assistant','content','It''s usually about ' || svc_dur || ' minutes. Want me to book a slot for you?'),
          jsonb_build_object('role','user','content','Maybe next week, I''ll call back. Thanks!'),
          jsonb_build_object('role','assistant','content','No problem at all. Talk to you soon!'))
        END
      WHEN 'transferred' THEN jsonb_build_array(
        jsonb_build_object('role','assistant','content','Thanks for calling ' || biz.name || ', this is ' || agent || '. How can I help you today?'),
        jsonb_build_object('role','user','content','Hi, I''ve got a question I''d rather ask ' || staff_title || ' directly.'),
        jsonb_build_object('role','assistant','content','Of course. Can I get your name so I can let them know who''s calling?'),
        jsonb_build_object('role','user','content', fname || ' ' || lname || '.'),
        jsonb_build_object('role','assistant','content','Thanks, ' || fname || '. One moment, I''ll connect you directly.'))
      ELSE NULL
    END;

    summ := CASE outcome
      WHEN 'appointment_booked' THEN fname || ' booked ' || svc || ' for ' || slot_day || ' at ' || slot_time || '.'
      WHEN 'lead_captured' THEN fname || ' asked about ' || svc || ', callback requested.'
      WHEN 'info_given' THEN CASE variant WHEN 0 THEN 'Asked about Sunday opening hours.' WHEN 1 THEN rtrim(info_q1, '?') || ', answered; asked about ' || lower(svc) || '.' ELSE 'Asked for directions, parking and visit length.' END
      WHEN 'transferred' THEN fname || ' asked to speak with ' || staff_title || ', transferred.'
      ELSE 'Missed call, no voicemail left.' END;

    dur := CASE WHEN turns IS NULL THEN 0 ELSE jsonb_array_length(turns) * (9 + floor(random() * 7)::int) END;

    INSERT INTO calls (business_id, vapi_call_id, caller_phone, language_detected, status, started_at, ended_at,
                       duration_secs, transcript, summary, extracted_data, outcome, cost_cents, created_at, transcript_status)
    VALUES (
      p_business, 'demo-seed-' || gen_random_uuid(), phone, 'en',
      CASE outcome WHEN 'missed' THEN 'missed' WHEN 'transferred' THEN 'transferred' ELSE 'completed' END,
      call_ts, call_ts + make_interval(secs => dur), dur,
      turns, summ,
      jsonb_build_object('caller_name', fname || ' ' || lname, 'service_needed', svc, 'demo_seed', true),
      outcome, (dur * 0.12)::int, call_ts,
      CASE WHEN outcome = 'missed' THEN 'pending' ELSE 'complete' END
    )
    RETURNING id INTO cid;
    created := created + 1;

    IF outcome = 'appointment_booked' THEN
      BEGIN
        INSERT INTO appointments (business_id, call_id, customer_name, customer_phone, service_type,
                                  scheduled_start, scheduled_end, status, created_at)
        VALUES (p_business, cid, fname || ' ' || lname, phone, svc, slot, slot + make_interval(mins => svc_dur),
                CASE WHEN slot + make_interval(mins => svc_dur) < now() THEN (CASE WHEN random() < 0.88 THEN 'completed' ELSE 'no_show' END) ELSE 'confirmed' END,
                call_ts);
      EXCEPTION WHEN exclusion_violation THEN
        NULL; -- raced with a real booking; the call still stands as a record
      END;
    ELSIF outcome = 'lead_captured' THEN
      INSERT INTO leads (business_id, call_id, name, phone, service_needed, urgency, notes, status, created_at, updated_at)
      VALUES (p_business, cid, fname || ' ' || lname, phone, svc,
              CASE WHEN random() < 0.15 THEN 'urgent' ELSE 'routine' END,
              CASE variant WHEN 1 THEN 'Prefers a call in the evening' ELSE 'Requested a callback' END,
              CASE WHEN call_ts < now() - interval '2 days' AND random() < 0.6 THEN 'contacted' ELSE 'new' END,
              call_ts, call_ts);
    END IF;
  END LOOP;

  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION generate_demo_activity(uuid, timestamptz, timestamptz, int) FROM PUBLIC, anon, authenticated;

-- Wipes this admin's demo data and regenerates the last 7 days (business
-- hours only, never future-dated). Used by the niche switcher so the whole
-- dashboard matches the newly selected industry.
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

  FOR d IN REVERSE 6..0 LOOP
    day_start := (date_trunc('day', now() AT TIME ZONE tz) - make_interval(days => d)) AT TIME ZONE tz;
    wfrom := day_start + interval '9 hours';
    wto := LEAST(day_start + interval '20 hours', now() - interval '5 minutes');
    IF wto > wfrom THEN
      total := total + generate_demo_activity(biz, wfrom, wto, 6 + floor(random() * 7)::int);
    END IF;
  END LOOP;
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION admin_regenerate_demo_week() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_regenerate_demo_week() TO authenticated;
