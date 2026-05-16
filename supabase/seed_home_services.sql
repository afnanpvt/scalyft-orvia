-- Orvia Demo Seed: Home Services (USA ICP)
-- Run after 001_initial_schema.sql is applied.
-- Safe to re-run: deletes existing seed data first.

DELETE FROM appointments WHERE clinic_id IN (SELECT id FROM clinics WHERE slug = 'swift-home-services');
DELETE FROM leads        WHERE clinic_id IN (SELECT id FROM clinics WHERE slug = 'swift-home-services');
DELETE FROM calls        WHERE clinic_id IN (SELECT id FROM clinics WHERE slug = 'swift-home-services');
DELETE FROM users        WHERE clinic_id IN (SELECT id FROM clinics WHERE slug = 'swift-home-services');
DELETE FROM clinics      WHERE slug = 'swift-home-services';

INSERT INTO clinics (name, slug, phone_display, timezone, status, settings)
VALUES (
    'Swift Home Services',
    'swift-home-services',
    '(512) 888-4200',
    'America/Chicago',
    'active',
    '{
      "doctor_name": null,
      "business_owner": "Mike Torres",
      "tagline": "Fast, honest home repairs — same day service",
      "address": "1840 S Lamar Blvd, Suite 102, Austin, TX 78704",
      "landmark": "Near South Congress, behind the Shell station",
      "city": "Austin, TX",
      "receptionist_name": "Orvia",
      "tone": "friendly, no-nonsense, efficient",
      "language_preference": "english",
      "special_instructions": [
        "Always ask for the zip code first to confirm we serve their area",
        "For water leaks or gas smells — treat as emergency, book same day",
        "Never quote exact prices — say our tech will give a free on-site estimate",
        "If they mention a home warranty, ask for the warranty company name and policy number",
        "For HVAC in summer (June-August) flag as high priority — heat emergencies are real"
      ],
      "service_area_zips": ["78701","78702","78703","78704","78705","78721","78722","78723","78724","78725","78726","78727","78728","78729","78730","78731","78732","78733","78734","78735","78736","78737","78738","78739","78741","78742","78744","78745","78746","78747","78748","78749","78750","78751","78752","78753","78754","78756","78757","78758","78759"],
      "operating_hours": {
        "monday":    { "open": "07:00", "close": "19:00", "lunch_break": null },
        "tuesday":   { "open": "07:00", "close": "19:00", "lunch_break": null },
        "wednesday": { "open": "07:00", "close": "19:00", "lunch_break": null },
        "thursday":  { "open": "07:00", "close": "19:00", "lunch_break": null },
        "friday":    { "open": "07:00", "close": "19:00", "lunch_break": null },
        "saturday":  { "open": "08:00", "close": "16:00", "lunch_break": null },
        "sunday":    { "closed": true }
      },
      "emergency_24_7": true,
      "emergency_services": ["burst pipe", "gas smell", "flooding", "no hot water", "heater out in winter"],
      "service_details": [
        {
          "name": "Drain Cleaning",
          "duration_minutes": 60,
          "price_range": "95-250",
          "description": "Clogged sink, tub, shower, or main line. Camera inspection available.",
          "can_book_directly": true,
          "category": "plumbing"
        },
        {
          "name": "Leak Repair",
          "duration_minutes": 90,
          "price_range": "150-500",
          "description": "Faucet leaks, pipe leaks, toilet running, shut-off valve replacement.",
          "can_book_directly": true,
          "category": "plumbing"
        },
        {
          "name": "Water Heater Repair / Replace",
          "duration_minutes": 120,
          "price_range": "200-1800",
          "description": "Repair or full replacement, traditional tank or tankless.",
          "can_book_directly": true,
          "category": "plumbing",
          "note": "Tech will assess on-site whether repair or replace is better"
        },
        {
          "name": "AC Repair",
          "duration_minutes": 90,
          "price_range": "89-600",
          "description": "AC not cooling, strange noises, refrigerant recharge, capacitor/fan issues.",
          "can_book_directly": true,
          "category": "hvac",
          "priority": "high"
        },
        {
          "name": "HVAC Tune-Up",
          "duration_minutes": 60,
          "price_range": "89-129",
          "description": "Full system inspection, filter check, coil cleaning, performance test.",
          "can_book_directly": true,
          "category": "hvac"
        },
        {
          "name": "Heater / Furnace Repair",
          "duration_minutes": 90,
          "price_range": "89-600",
          "description": "No heat, pilot light issues, thermostat problems.",
          "can_book_directly": true,
          "category": "hvac",
          "priority": "high"
        },
        {
          "name": "Electrical Outlet / Switch",
          "duration_minutes": 60,
          "price_range": "85-250",
          "description": "Dead outlets, flickering lights, GFCI replacement, dimmer install.",
          "can_book_directly": true,
          "category": "electrical"
        },
        {
          "name": "Panel Inspection / Upgrade",
          "duration_minutes": 120,
          "price_range": "150-3500",
          "description": "Breaker tripping, panel upgrade, safety inspection.",
          "can_book_directly": false,
          "category": "electrical",
          "note": "Requires on-site quote first"
        },
        {
          "name": "General Handyman",
          "duration_minutes": 60,
          "price_range": "85-200",
          "description": "Drywall patches, door/window repairs, caulking, minor carpentry.",
          "can_book_directly": true,
          "category": "handyman"
        }
      ],
      "faq": [
        {
          "question": "Do you charge for estimates?",
          "answer": "Our technicians provide free on-site estimates. You only pay if you approve the work."
        },
        {
          "question": "Do you work with home warranties?",
          "answer": "Yes, we work with most major home warranty companies including American Home Shield, Choice Home Warranty, and First American. Just have your policy number ready."
        },
        {
          "question": "How soon can someone come out?",
          "answer": "We offer same-day service on most calls booked before noon. Emergency calls are typically within 2 hours."
        },
        {
          "question": "Are your technicians licensed?",
          "answer": "Yes, all our plumbers and electricians are fully licensed and insured in the state of Texas."
        },
        {
          "question": "What payment do you accept?",
          "answer": "We accept all major credit cards, cash, check, and financing options for larger jobs."
        }
      ],
      "emergency_protocol": {
        "during_hours": "Dispatch technician same day, prioritize over routine calls",
        "after_hours": "Take name, phone, address, and nature of emergency. Alert on-call tech immediately via SMS. Callback within 30 minutes.",
        "emergency_contact": "+15128884201"
      },
      "calendar": {
        "slot_duration_default": 60,
        "buffer_between_appointments": 30,
        "max_appointments_per_day": 12,
        "travel_time_buffer": true
      }
    }'::jsonb
);

-- ─── Sample Calls ─────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_clinic UUID;
    v_call1  UUID;
    v_call2  UUID;
    v_call3  UUID;
    v_call4  UUID;
    v_call5  UUID;
    v_lead1  UUID;
    v_lead2  UUID;
BEGIN
    SELECT id INTO v_clinic FROM clinics WHERE slug = 'swift-home-services';

    -- Call 1: AC not working, appointment booked (summer priority)
    INSERT INTO calls (clinic_id, vapi_call_id, caller_phone, status, started_at, ended_at,
                       duration_secs, outcome, cost_cents, summary, transcript)
    VALUES (
        v_clinic, 'vapi-hs-001', '+15125550101', 'completed',
        NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours 54 minutes', 340,
        'appointment_booked', 51,
        'Customer called about AC not cooling. House at 84F, family with young kids. Booked same-day afternoon slot.',
        '[
          {"role":"assistant","content":"Thank you for calling Swift Home Services. This is Orvia. What''s going on at your place today?"},
          {"role":"user","content":"Yeah hi, my AC stopped working. It''s like 84 degrees in here and I got two little kids."},
          {"role":"assistant","content":"Oh no, that''s rough especially with kids — let''s get someone out to you today. First, can you give me your zip code so I can confirm we''re in your area?"},
          {"role":"user","content":"78745"},
          {"role":"assistant","content":"Perfect, that''s right in our service area. Is the unit running at all — like the fan spinning but just not cooling?"},
          {"role":"user","content":"Yeah the fan comes on but it''s just blowing warm air"},
          {"role":"assistant","content":"Got it, sounds like it could be the refrigerant or a capacitor — our tech will know right away. Can I get your name and the best number to reach you?"},
          {"role":"user","content":"Sarah Nguyen, this number is fine"},
          {"role":"assistant","content":"Perfect Sarah. We have a slot open today between 2 and 4 PM. Does that work?"},
          {"role":"user","content":"Yes please, that''s great"},
          {"role":"assistant","content":"You''re all set. Tech will call 30 minutes before arrival. Is there anything else I can help with?"}
        ]'::jsonb
    ) RETURNING id INTO v_call1;

    -- Call 2: Burst pipe under kitchen sink, emergency
    INSERT INTO calls (clinic_id, vapi_call_id, caller_phone, status, started_at, ended_at,
                       duration_secs, outcome, cost_cents, summary, transcript)
    VALUES (
        v_clinic, 'vapi-hs-002', '+15125550202', 'completed',
        NOW() - INTERVAL '1 day 2 hours', NOW() - INTERVAL '1 day 1 hour 57 minutes', 175,
        'appointment_booked', 26,
        'Emergency call — pipe burst under kitchen sink, water shut off. Dispatched tech within 1 hour.',
        '[
          {"role":"assistant","content":"Swift Home Services, this is Orvia. What''s going on?"},
          {"role":"user","content":"I got water everywhere, pipe just burst under my kitchen sink"},
          {"role":"assistant","content":"Okay — first thing, can you shut off the water valve under the sink? It''s usually a small knob or handle on the pipe going into the wall."},
          {"role":"user","content":"Yeah I already did that, the water stopped"},
          {"role":"assistant","content":"Good job, you handled that perfectly. We''ll get someone out to you right away — this is an emergency call so it goes to the front of the line. What''s your address and zip?"},
          {"role":"user","content":"2201 Manor Road, 78722"},
          {"role":"assistant","content":"Got it. And your name?"},
          {"role":"user","content":"James Holloway"},
          {"role":"assistant","content":"James, our tech David will be there within the hour. He''ll call you when he''s 15 minutes out. You''re all set."}
        ]'::jsonb
    ) RETURNING id INTO v_call2;

    -- Call 3: Lead captured - panel upgrade inquiry
    INSERT INTO calls (clinic_id, vapi_call_id, caller_phone, status, started_at, ended_at,
                       duration_secs, outcome, cost_cents, summary, transcript)
    VALUES (
        v_clinic, 'vapi-hs-003', '+15125550303', 'completed',
        NOW() - INTERVAL '2 days 5 hours', NOW() - INTERVAL '2 days 4 hours 56 minutes', 240,
        'lead_captured', 36,
        'Homeowner adding EV charger, needs 200A panel upgrade. Captured lead for on-site quote.',
        '[
          {"role":"assistant","content":"Swift Home Services, this is Orvia. How can I help?"},
          {"role":"user","content":"Hi, I''m trying to get an EV charger installed in my garage but my neighbor said I might need a panel upgrade first"},
          {"role":"assistant","content":"That''s a great question — it really depends on your current panel capacity. Do you know if you have a 100 amp or 200 amp panel?"},
          {"role":"user","content":"I honestly have no idea, it''s an older house, built in the 80s"},
          {"role":"assistant","content":"No worries — 80s homes often have 100 amp panels which do need upgrading for EV chargers. Our electrician can do a free on-site assessment and give you a quote. What''s your zip code?"},
          {"role":"user","content":"78703"},
          {"role":"assistant","content":"Perfect, we cover that area. Can I get your name and number so we can schedule the estimate?"},
          {"role":"user","content":"Tom Bradley, 512-555-0303"},
          {"role":"assistant","content":"Great Tom. I''ve captured your info and our team will reach out within one business day to schedule the assessment. Anything else?"}
        ]'::jsonb
    ) RETURNING id INTO v_call3;

    -- Call 4: Water heater inquiry, info given
    INSERT INTO calls (clinic_id, vapi_call_id, caller_phone, status, started_at, ended_at,
                       duration_secs, outcome, cost_cents, summary)
    VALUES (
        v_clinic, 'vapi-hs-004', '+15125550404', 'completed',
        NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours 57 minutes', 150,
        'info_given', 22,
        'Caller asked about tankless water heater cost and lead times. Provided info, no booking yet.'
    ) RETURNING id INTO v_call4;

    -- Call 5: Drain clog, appointment booked
    INSERT INTO calls (clinic_id, vapi_call_id, caller_phone, status, started_at, ended_at,
                       duration_secs, outcome, cost_cents, summary)
    VALUES (
        v_clinic, 'vapi-hs-005', '+15125550505', 'completed',
        NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours 56 minutes', 195,
        'appointment_booked', 29,
        'Kitchen sink draining very slowly. Booked tomorrow morning between 9-11 AM.'
    ) RETURNING id INTO v_call5;

    -- Lead from call 3 (panel upgrade)
    INSERT INTO leads (clinic_id, call_id, name, phone, service_needed, urgency, notes, status)
    VALUES (
        v_clinic, v_call3,
        'Tom Bradley', '+15125550303',
        'Panel Inspection / Upgrade',
        'routine',
        'Needs 200A panel upgrade for EV charger install. House built ~1985. Has a 100A panel most likely. Good upsell opportunity — EV charger install too.',
        'new'
    ) RETURNING id INTO v_lead1;

    -- Lead from call 4 (tankless water heater)
    INSERT INTO leads (clinic_id, call_id, name, phone, service_needed, urgency, notes, status)
    VALUES (
        v_clinic, v_call4,
        'Unknown Caller', '+15125550404',
        'Water Heater Repair / Replace',
        'routine',
        'Interested in tankless water heater replacement. Asked about cost and timeline. Did not book yet — follow up recommended.',
        'new'
    ) RETURNING id INTO v_lead2;

    -- Appointment from call 1 (AC repair today)
    INSERT INTO appointments (clinic_id, call_id, patient_name, patient_phone, service_type,
                              scheduled_start, scheduled_end, status, notes)
    VALUES (
        v_clinic, v_call1,
        'Sarah Nguyen', '+15125550101',
        'AC Repair',
        NOW()::date + INTERVAL '14 hours',
        NOW()::date + INTERVAL '16 hours',
        'confirmed',
        'AC blowing warm air. Has two young children at home. Priority visit.'
    );

    -- Appointment from call 2 (emergency pipe burst)
    INSERT INTO appointments (clinic_id, call_id, patient_name, patient_phone, service_type,
                              scheduled_start, scheduled_end, status, notes)
    VALUES (
        v_clinic, v_call2,
        'James Holloway', '+15125550202',
        'Leak Repair',
        NOW() - INTERVAL '1 day 1 hour',
        NOW() - INTERVAL '1 day',
        'completed',
        'Burst pipe under kitchen sink. Water already shut off on arrival. Replaced supply line and P-trap.'
    );

    -- Appointment from call 5 (drain clog tomorrow)
    INSERT INTO appointments (clinic_id, call_id, patient_name, patient_phone, service_type,
                              scheduled_start, scheduled_end, status)
    VALUES (
        v_clinic, v_call5,
        'Maria Santos', '+15125550505',
        'Drain Cleaning',
        NOW()::date + INTERVAL '1 day 9 hours',
        NOW()::date + INTERVAL '1 day 11 hours',
        'confirmed'
    );

END $$;
