-- Fixture data for the end-to-end tests. auth.users rows are created by the
-- harness (it hashes the passwords) before this runs.
--   owner@smile.test  / Correct-horse-1   owner of Smile Dental
--   temp@smile.test   / Temp-pass-123     must change password
--   orphan@x.test     / Orphan-pass-123   signs in but has no business
--   owner@rival.test  / Rival-pass-123    owner of Rival Clinic

TRUNCATE operational_events, call_queue, leads, appointments, calls, mobile_devices, users, businesses CASCADE;

INSERT INTO businesses (id, name, slug, phone_display, vapi_phone_id, timezone, status, seconds_remaining, owner_phone, ai_number, settings) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Smile Dental', 'smile', '+91 80 4000 1000', 'vapi-phone-1', 'Asia/Kolkata', 'active', 3600, '+919800000099', '+918040001000',
   '{"greeting":"Thanks for calling Smile Dental.","transfer_number":"98765 43210","hours":"10-7","faq":[{"question":"Parking?","answer":"Yes, behind the clinic."}]}'),
  ('b0000000-0000-4000-8000-000000000002', 'Rival Clinic', 'rival', '+91 80 5000 2000', 'vapi-phone-2', 'Asia/Kolkata', 'active', 1800, NULL, '+918050002000', '{}');

INSERT INTO users (id, business_id, email, full_name, role, must_change_password) VALUES
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'owner@smile.test', 'Dr. Rao', 'owner', false),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000001', 'temp@smile.test', 'Temp User', 'staff', true),
  ('44444444-4444-4444-8444-444444444444', 'b0000000-0000-4000-8000-000000000002', 'owner@rival.test', 'Rival Owner', 'owner', false);

INSERT INTO calls (id, business_id, vapi_call_id, caller_phone, status, outcome, started_at, ended_at, duration_secs, summary, transcript, transcript_status, extracted_data, recording_url, created_at) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'seed-1', '+919876500001', 'completed', 'appointment_booked',
   now() - interval '6 minutes', now() - interval '4 minutes', 142,
   'Asha Rao booked a teeth cleaning for tomorrow at 10:30 am.',
   '[{"role":"assistant","content":"Thanks for calling Smile Dental. How can I help?"},{"role":"user","content":"I would like to book a cleaning."},{"role":"assistant","content":"Of course. Tomorrow at 10:30 am works. May I have your name?"},{"role":"user","content":"Asha Rao."}]',
   'complete', '{}', 'https://example.com/recordings/seed-1.mp3', now() - interval '6 minutes'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'seed-2', '+919876500003', 'missed', 'missed',
   now() - interval '9 minutes', now() - interval '9 minutes', NULL, NULL, NULL, 'failed', '{}', NULL, now() - interval '9 minutes'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'seed-3', '+919876500004', 'failed', NULL,
   now() - interval '30 hours', now() - interval '30 hours', 12, NULL, NULL, 'failed', '{}', NULL, now() - interval '30 hours'),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'seed-4', '+919876500005', 'completed', 'info_given',
   now() - interval '31 hours', now() - interval '31 hours', 67, 'Asked about clinic hours and parking.',
   '[{"role":"assistant","content":"Thanks for calling Smile Dental."},{"role":"user","content":"What are your hours?"}]',
   'complete', '{}', NULL, now() - interval '31 hours'),
  ('c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'web-seed', NULL, 'completed', 'info_given',
   now() - interval '3 days', now() - interval '3 days', 40, 'Browser test call.', NULL, 'complete', '{}', NULL, now() - interval '3 days'),
  ('c0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000002', 'seed-b1', '+919876599999', 'completed', 'info_given',
   now() - interval '10 minutes', now() - interval '9 minutes', 50, 'Rival Clinic secret call.', NULL, 'complete', '{}', NULL, now() - interval '10 minutes');

INSERT INTO appointments (id, business_id, call_id, customer_name, customer_phone, service_type, scheduled_start, scheduled_end, status) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Asha Rao', '+919876500001', 'Teeth cleaning', now() + interval '1 day', now() + interval '1 day 30 minutes', 'confirmed'),
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', NULL, 'Vikram Shah', '+919876500009', 'Root canal consult', now() + interval '2 days', now() + interval '2 days 45 minutes', 'confirmed'),
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', NULL, 'Meena Iyer', '+919876500010', 'Check-up', now() - interval '2 days', now() - interval '2 days' + interval '30 minutes', 'completed'),
  ('d0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000002', NULL, 'Rival Patient', '+919876599998', 'Secret', now() + interval '1 day', NULL, 'confirmed');

INSERT INTO leads (id, business_id, call_id, name, phone, service_needed, urgency, status) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', NULL, 'Ravi Kumar', '+919876500020', 'Tooth pain', 'emergency', 'new'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', NULL, 'Latha S', '+919876500021', 'Braces enquiry', 'routine', 'contacted');

INSERT INTO call_queue (id, business_id, call_id, queue_type, priority, caller_phone, caller_name, service_needed, status) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'missed_callback', 2, '+919876500003', NULL, NULL, 'pending'),
  ('f0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', NULL, 'partial_booking', 5, '+919876500030', 'Kiran', 'whitening', 'pending');

INSERT INTO operational_events (id, business_id, call_id, event_type, severity) VALUES
  ('90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'ai_failure', 'warning');
