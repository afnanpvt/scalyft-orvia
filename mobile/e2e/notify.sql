-- Test-only: tell the gateway when rows change, so it can play Supabase
-- Realtime. Only the id is sent (NOTIFY payloads are capped at 8 KB and the
-- app refetches anyway).
CREATE OR REPLACE FUNCTION e2e_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('e2e_changes', json_build_object(
    'table', TG_TABLE_NAME,
    'type',  TG_OP,
    'id',    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
  )::text);
  RETURN NULL;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['calls', 'appointments', 'call_queue', 'operational_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS e2e_notify ON public.%I', t);
    EXECUTE format('CREATE TRIGGER e2e_notify AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION e2e_notify()', t);
  END LOOP;
END
$$;
