-- Seeds 7 days of calls + appointments for the "This Week" chart.
-- Each day gets a realistic mix: some calls book, some don't.
-- Run AFTER seed_home_services.sql (relies on the swift-home-services row).

BEGIN;

DO $$
DECLARE
    v_business UUID;
    v_today DATE := CURRENT_DATE;
    v_day_offset INT;
    v_call_id UUID;
    v_calls_per_day INT;
    v_bookings_per_day INT;
    v_day_date DATE;
    v_i INT;
    v_name TEXT;
    v_service TEXT;

    -- Per-day plan: 7 entries, days[0] = 6 days ago, days[6] = today.
    -- (calls, bookings) pairs. Booking rate varies day-to-day for realism.
    v_calls   INT[] := ARRAY[ 8, 12,  5, 14, 10,  7, 4];
    v_booked  INT[] := ARRAY[ 5,  9,  3, 11,  7,  4, 3];

    -- 40 realistic US first+last names. Indexed by (day_offset * 10 + i) so each
    -- caller gets a unique, human-sounding name across the week. No "Customer N-N".
    v_names TEXT[] := ARRAY[
        'Sarah Nguyen','James Holloway','Maria Santos','Tom Bradley','David Park',
        'Aisha Patel','Robert Klein','Linda Carter','Jamal Wright','Ella Thompson',
        'Marcus Reyes','Priya Shah','Daniel Cohen','Olivia Brennan','Andre Williams',
        'Jenna Wallace','Hector Ramirez','Caitlin O''Brien','Yusuf Demir','Grace Okonkwo',
        'Brandon Hayes','Sofia Mendes','Christopher Lin','Naomi Fisher','Eli Sandoval',
        'Hannah Bishop','Devon Murray','Ravi Krishnan','Bethany Crawford','Vincent Tran',
        'Adeline Vasquez','Marcus Greene','Iris Bennett','Connor Walsh','Layla Hassan',
        'Pierre Beaumont','Tessa Rowland','Omar Khalil','Madeline Frost','Cole Atkinson'
    ];

    v_services TEXT[] := ARRAY[
        'AC Repair','Drain Cleaning','Leak Repair','Water Heater',
        'Electrical Inspection','Faucet Replacement','Panel Upgrade Estimate','AC Maintenance'
    ];
BEGIN
    SELECT id INTO v_business FROM businesses WHERE slug = 'swift-home-services';
    IF v_business IS NULL THEN
        RAISE NOTICE 'swift-home-services not found, skipping this-week seed';
        RETURN;
    END IF;

    -- Wipe only the last 7 days of calls/appointments so we don't blow away
    -- the operational events seed or older historical data.
    DELETE FROM appointments
    WHERE business_id = v_business
      AND created_at >= NOW() - INTERVAL '7 days';
    DELETE FROM calls
    WHERE business_id = v_business
      AND created_at >= NOW() - INTERVAL '7 days';

    FOR v_day_offset IN 0..6 LOOP
        v_day_date := v_today - (6 - v_day_offset);
        v_calls_per_day    := v_calls[v_day_offset + 1];
        v_bookings_per_day := v_booked[v_day_offset + 1];

        FOR v_i IN 1..v_calls_per_day LOOP
            -- Pick a unique name per (day, i) — covers up to 14 calls/day across 7 days.
            v_name := v_names[(v_day_offset * 6 + v_i - 1) % 40 + 1];
            v_service := v_services[(v_i - 1) % 8 + 1];

            INSERT INTO calls (
                business_id, vapi_call_id, caller_phone, status,
                started_at, ended_at, duration_secs,
                outcome, cost_cents, summary, created_at
            ) VALUES (
                v_business,
                'vapi-week-' || v_day_offset || '-' || v_i,
                '+1512555' || LPAD((1000 + v_day_offset * 100 + v_i)::text, 4, '0'),
                'completed',
                v_day_date + (8 + v_i) * INTERVAL '1 hour',
                v_day_date + (8 + v_i) * INTERVAL '1 hour' + INTERVAL '3 minutes',
                180,
                CASE WHEN v_i <= v_bookings_per_day THEN 'appointment_booked'
                     WHEN v_i <= v_bookings_per_day + 1 THEN 'lead_captured'
                     ELSE 'info_given' END,
                27,
                CASE WHEN v_i <= v_bookings_per_day
                     THEN v_name || ' booked a ' || v_service
                     ELSE v_name || ' inquired about ' || v_service END,
                v_day_date + (8 + v_i) * INTERVAL '1 hour'
            ) RETURNING id INTO v_call_id;

            IF v_i <= v_bookings_per_day THEN
                INSERT INTO appointments (
                    business_id, call_id,
                    customer_name, customer_phone, service_type,
                    scheduled_start, scheduled_end, status, created_at
                ) VALUES (
                    v_business, v_call_id,
                    v_name,
                    '+1512555' || LPAD((1000 + v_day_offset * 100 + v_i)::text, 4, '0'),
                    v_service,
                    v_day_date + INTERVAL '1 day' + (9 + v_i) * INTERVAL '1 hour',
                    v_day_date + INTERVAL '1 day' + (10 + v_i) * INTERVAL '1 hour',
                    'confirmed',
                    v_day_date + (8 + v_i) * INTERVAL '1 hour'
                );
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Seeded 7 days: 60 calls, 42 bookings';
END $$;

COMMIT;
