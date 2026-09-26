-- Browser test calls (Talk to Assistant / Demo) arrive with no caller number,
-- so the dashboard showed them as "Unknown". Tag them so the UI labels them
-- "Test call". vapi-events rewrites extracted_data on end-of-call, so this
-- also runs on update. Generated demo rows are never touched.
-- Caveat: once a real phone line is live, a caller with a hidden number
-- would also be tagged; revisit if that matters.

CREATE OR REPLACE FUNCTION tag_web_calls() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.caller_phone IS NULL AND COALESCE(NEW.vapi_call_id, '') NOT LIKE 'demo-seed-%' THEN
    NEW.extracted_data := COALESCE(NEW.extracted_data, '{}'::jsonb) || '{"source":"web"}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calls_tag_web ON calls;
CREATE TRIGGER calls_tag_web
  BEFORE INSERT OR UPDATE OF caller_phone, extracted_data ON calls
  FOR EACH ROW EXECUTE FUNCTION tag_web_calls();

UPDATE calls SET extracted_data = COALESCE(extracted_data, '{}'::jsonb) || '{"source":"web"}'::jsonb
 WHERE caller_phone IS NULL AND COALESCE(vapi_call_id, '') NOT LIKE 'demo-seed-%';
