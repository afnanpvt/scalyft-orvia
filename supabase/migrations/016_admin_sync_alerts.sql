-- Admin control to manually refresh Needs Attention/bell items for the demo
-- account. sync_demo_alerts() only raises an alert for a call once ever (it
-- checks call_queue for any existing row, handled or not), so after
-- dismissing everything there was no way to bring more up without a full
-- Admin > Demo Niche regenerate. This widens eligibility to the last 14
-- days (vs. 1-2 days) so there's always a pool of untouched demo calls to
-- draw from, and exposes it as an admin RPC.

CREATE OR REPLACE FUNCTION sync_demo_alerts(p_business uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT id, caller_phone, extracted_data->>'caller_name' AS name, extracted_data->>'service_needed' AS svc
      FROM calls
     WHERE business_id = p_business AND extracted_data->>'demo_seed' = 'true'
       AND outcome = 'missed' AND created_at > now() - interval '14 days'
       AND NOT EXISTS (SELECT 1 FROM call_queue q WHERE q.call_id = calls.id)
     ORDER BY created_at DESC
     LIMIT GREATEST(0, 2 - (SELECT count(*) FROM call_queue q JOIN calls dc ON dc.id = q.call_id
                             WHERE q.business_id = p_business AND q.status = 'pending'
                               AND q.queue_type = 'missed_callback' AND dc.extracted_data->>'demo_seed' = 'true'))
  LOOP
    INSERT INTO call_queue (business_id, call_id, queue_type, priority, caller_phone, caller_name, service_needed, status, created_at)
    VALUES (p_business, c.id, 'missed_callback', 5, c.caller_phone, NULL, NULL, 'pending', now());
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM call_queue q JOIN calls dc ON dc.id = q.call_id
     WHERE q.business_id = p_business AND q.status = 'pending' AND q.queue_type = 'partial_booking'
       AND dc.extracted_data->>'demo_seed' = 'true'
  ) THEN
    SELECT id, caller_phone, extracted_data->>'caller_name' AS name, extracted_data->>'service_needed' AS svc
      INTO c
      FROM calls
     WHERE business_id = p_business AND extracted_data->>'demo_seed' = 'true'
       AND outcome = 'lead_captured' AND created_at > now() - interval '14 days'
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

-- Manual trigger for admins: "bring more items into Needs Attention" without
-- a full demo-data regenerate. Returns how many pending items exist after.
CREATE OR REPLACE FUNCTION admin_sync_demo_alerts() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  biz uuid := admin_business_id();
  total int;
BEGIN
  IF biz IS NULL THEN RAISE EXCEPTION 'admin only'; END IF;
  PERFORM sync_demo_alerts(biz);
  SELECT count(*) INTO total FROM call_queue WHERE business_id = biz AND status = 'pending';
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION admin_sync_demo_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_sync_demo_alerts() TO authenticated;
