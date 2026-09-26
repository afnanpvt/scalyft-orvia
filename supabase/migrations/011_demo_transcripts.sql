-- Richer generated demo calls: full, outcome-appropriate conversations
-- (8–13 turns) instead of 5-line stubs. The booking slot is chosen before
-- the call is written so the transcript quotes the real appointment time.
-- Prices, address and business name come from the business's own settings.

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
BEGIN
  SELECT id, name, timezone, settings INTO biz FROM businesses WHERE id = p_business;
  IF biz.id IS NULL OR p_to <= p_from OR p_count <= 0 THEN RETURN 0; END IF;
  tz := COALESCE(biz.timezone, 'America/Chicago');
  agent := COALESCE(NULLIF(biz.settings->>'receptionist_name', ''), 'Orvia');
  address := NULLIF(biz.settings->>'address', '');

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
    phone := '+91 9' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0');
    si := 1 + floor(random() * array_length(svc_names, 1))::int;
    svc := svc_names[si]; svc_dur := svc_durations[si]; bookable := svc_bookable[si]; price := svc_prices[si];
    variant := floor(random() * 3)::int;

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
        jsonb_build_object('role','assistant','content', svc || ' usually ranges from ' || price || ', depending on what''s needed. The team would want to take a proper look first so they can give you an exact plan.'),
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
          jsonb_build_object('role','assistant','content','We''re closed on Sundays, but open Monday through Saturday. Would you like me to book you in for one of those days?'),
          jsonb_build_object('role','user','content','Not right now, I just wanted to check. What time do you close on Saturday?'),
          jsonb_build_object('role','assistant','content','On Saturdays we''re open until the evening. You can call back any time and I''ll get you booked in.'),
          jsonb_build_object('role','user','content','Perfect, thanks.'),
          jsonb_build_object('role','assistant','content','You''re welcome. Have a great day!'))
        WHEN 1 THEN jsonb_build_array(
          jsonb_build_object('role','assistant','content','Thanks for calling ' || biz.name || ', this is ' || agent || '. How can I help?'),
          jsonb_build_object('role','user','content','Hi, do you accept insurance?'),
          jsonb_build_object('role','assistant','content','We work with most major insurance providers. If you bring your card to your visit, the front desk will confirm your coverage before any treatment.'),
          jsonb_build_object('role','user','content','Okay. And how much is a ' || lower(svc) || ' without insurance?'),
          jsonb_build_object('role','assistant','content','It usually ranges from ' || price || '. Would you like me to find you a time?'),
          jsonb_build_object('role','user','content','I''ll check with my insurance first and call back.'),
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
        jsonb_build_object('role','user','content','Hi, I had a treatment last week and I have a question for the doctor directly.'),
        jsonb_build_object('role','assistant','content','Of course. Can I get your name so I can let them know who''s calling?'),
        jsonb_build_object('role','user','content', fname || ' ' || lname || '.'),
        jsonb_build_object('role','assistant','content','Thanks, ' || fname || '. One moment, I''ll connect you directly.'))
      ELSE NULL
    END;

    summ := CASE outcome
      WHEN 'appointment_booked' THEN fname || ' booked ' || svc || ' for ' || slot_day || ' at ' || slot_time || '.'
      WHEN 'lead_captured' THEN fname || ' asked about ' || svc || ' pricing — callback requested.'
      WHEN 'info_given' THEN CASE variant WHEN 0 THEN 'Asked about Sunday and Saturday hours.' WHEN 1 THEN 'Asked about insurance and ' || lower(svc) || ' pricing.' ELSE 'Asked for directions, parking and visit length.' END
      WHEN 'transferred' THEN fname || ' asked to speak with the doctor — transferred.'
      ELSE 'Missed call — no voicemail left.' END;

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
