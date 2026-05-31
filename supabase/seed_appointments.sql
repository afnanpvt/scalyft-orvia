-- Refresh upcoming appointments for swift-home-services
-- Run after seed_home_services.sql. Idempotent.
-- Generates 10 appointments spread over the next 7 days from NOW().

BEGIN;

DO $$
DECLARE
    v_business UUID;
    v_today DATE := CURRENT_DATE;
BEGIN
    SELECT id INTO v_business FROM businesses WHERE slug = 'swift-home-services';
    IF v_business IS NULL THEN
        RAISE NOTICE 'swift-home-services not found, skipping appointment seed';
        RETURN;
    END IF;

    -- Wipe any old upcoming appointments (keep historical/completed ones)
    DELETE FROM appointments
    WHERE business_id = v_business
      AND scheduled_start >= NOW() - INTERVAL '1 day';

    -- Today: 2 appointments
    INSERT INTO appointments (business_id, customer_name, customer_phone, service_type, scheduled_start, scheduled_end, status, notes) VALUES
    (v_business, 'Sarah Nguyen', '+15125550101', 'AC Repair',
     v_today + TIME '14:00', v_today + TIME '16:00', 'confirmed',
     'AC blowing warm air. Family with young kids. Priority visit.'),
    (v_business, 'Marcus Reyes', '+15125550110', 'Drain Cleaning',
     v_today + TIME '16:30', v_today + TIME '17:30', 'confirmed',
     'Kitchen sink draining slowly. Snake job likely.');

    -- Tomorrow: 3 appointments
    INSERT INTO appointments (business_id, customer_name, customer_phone, service_type, scheduled_start, scheduled_end, status, notes) VALUES
    (v_business, 'Maria Santos', '+15125550505', 'Drain Cleaning',
     v_today + INTERVAL '1 day' + TIME '09:00', v_today + INTERVAL '1 day' + TIME '11:00', 'confirmed',
     'Standing water in master bath. Possible main line clog.'),
    (v_business, 'David Park', '+15125550112', 'Water Heater Repair',
     v_today + INTERVAL '1 day' + TIME '11:30', v_today + INTERVAL '1 day' + TIME '13:00', 'confirmed',
     'No hot water for 2 days. Will diagnose tank or element.'),
    (v_business, 'Ella Thompson', '+15125550114', 'Leak Repair',
     v_today + INTERVAL '1 day' + TIME '15:00', v_today + INTERVAL '1 day' + TIME '16:30', 'rescheduled',
     'Slow leak under bathroom vanity. Was on Wednesday, moved up.');

    -- Day after tomorrow: 2 appointments
    INSERT INTO appointments (business_id, customer_name, customer_phone, service_type, scheduled_start, scheduled_end, status, notes) VALUES
    (v_business, 'Robert Klein', '+15125550118', 'Electrical Inspection',
     v_today + INTERVAL '2 days' + TIME '10:00', v_today + INTERVAL '2 days' + TIME '12:00', 'confirmed',
     'Lights flickering on 2nd floor. Older home, 1970s panel.'),
    (v_business, 'Aisha Patel', '+15125550120', 'AC Maintenance',
     v_today + INTERVAL '2 days' + TIME '13:00', v_today + INTERVAL '2 days' + TIME '14:30', 'confirmed',
     'Annual tune-up before summer. Repeat customer.');

    -- 3 days out: 2 appointments
    INSERT INTO appointments (business_id, customer_name, customer_phone, service_type, scheduled_start, scheduled_end, status, notes) VALUES
    (v_business, 'Tom Bradley', '+15125550303', 'Panel Upgrade Estimate',
     v_today + INTERVAL '3 days' + TIME '09:30', v_today + INTERVAL '3 days' + TIME '10:30', 'confirmed',
     'Free estimate for 200A panel upgrade. EV charger install planned.'),
    (v_business, 'Linda Carter', '+15125550122', 'Faucet Replacement',
     v_today + INTERVAL '3 days' + TIME '14:00', v_today + INTERVAL '3 days' + TIME '15:00', 'confirmed',
     'Kitchen faucet replacement. Customer providing fixture.');

    -- 5 days out: 1 appointment
    INSERT INTO appointments (business_id, customer_name, customer_phone, service_type, scheduled_start, scheduled_end, status, notes) VALUES
    (v_business, 'Jamal Wright', '+15125550124', 'Water Heater Replacement',
     v_today + INTERVAL '5 days' + TIME '08:00', v_today + INTERVAL '5 days' + TIME '12:00', 'confirmed',
     'Full tankless water heater installation. 4-hour window.');

    RAISE NOTICE 'Seeded 10 upcoming appointments for swift-home-services';
END $$;

COMMIT;
