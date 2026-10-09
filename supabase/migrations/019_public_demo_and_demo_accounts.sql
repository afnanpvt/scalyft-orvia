-- Migration 019: public voice demo limits and time-limited demo accounts.
--
-- 1. demo_limits + demo_token_hits + claim_demo_token(): limits for the public
--    "hear a demo call" token endpoint, kept in Postgres so they survive cold
--    starts (the old limit lived in one function instance's memory). Admins
--    set them from Admin > Demo Data: a daily cap (empty = no cap, 0 = demo
--    paused) and a per-visitor limit. Only the service role can touch the log.
-- 2. users.demo_expires_at: prospects get a real account that stops working
--    on a date. expire_demo_accounts() (cron, every 15 minutes) bans the login
--    once the date passes; admin_set_demo_expiry() sets, extends or clears it.
--    A trigger stops anyone but that function from writing the column.

BEGIN;

-- ── 1. Public demo limits ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demo_limits (
  singleton   boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
  daily_cap   int         CHECK (daily_cap IS NULL OR daily_cap >= 0),  -- NULL = no cap, 0 = demo paused
  per_visitor int         NOT NULL DEFAULT 6 CHECK (per_visitor BETWEEN 1 AND 100),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO demo_limits (singleton) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE demo_limits ENABLE ROW LEVEL SECURITY;  -- no policies: functions only
REVOKE ALL ON demo_limits FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS demo_token_hits (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash text        NOT NULL,
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demo_token_hits_ip_at ON demo_token_hits (ip_hash, at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_token_hits_at ON demo_token_hits (at);

ALTER TABLE demo_token_hits ENABLE ROW LEVEL SECURITY;  -- no policies: service role only
REVOKE ALL ON demo_token_hits FROM PUBLIC, anon, authenticated;

-- Records one token request and says whether it is allowed.
-- Returns 'ok', 'ip_limit' (this visitor asked too often) or 'daily_cap'
-- (everyone together reached today's cap). A refused request is not recorded,
-- so a blocked visitor does not extend their own block.
CREATE OR REPLACE FUNCTION claim_demo_token(
  p_ip_hash     text,
  p_window_secs int
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim demo_limits;
  ip_hits int;
  day_hits int;
BEGIN
  SELECT * INTO lim FROM demo_limits WHERE singleton;

  -- Keep the table small without a separate job.
  IF random() < 0.02 THEN
    DELETE FROM demo_token_hits WHERE at < now() - interval '2 days';
  END IF;

  SELECT count(*) INTO ip_hits FROM demo_token_hits
   WHERE ip_hash = p_ip_hash AND at > now() - make_interval(secs => p_window_secs);
  IF ip_hits >= COALESCE(lim.per_visitor, 6) THEN RETURN 'ip_limit'; END IF;

  IF lim.daily_cap IS NOT NULL THEN
    SELECT count(*) INTO day_hits FROM demo_token_hits WHERE at > now() - interval '24 hours';
    IF day_hits >= lim.daily_cap THEN RETURN 'daily_cap'; END IF;
  END IF;

  INSERT INTO demo_token_hits (ip_hash) VALUES (p_ip_hash);
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION claim_demo_token(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_demo_token(text, int) TO service_role;

-- Admin: current limits and how many demo calls were started in the last 24 hours.
CREATE OR REPLACE FUNCTION admin_get_demo_limits()
RETURNS TABLE (daily_cap int, per_visitor int, used_24h int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN QUERY
  SELECT l.daily_cap, l.per_visitor,
         (SELECT count(*)::int FROM demo_token_hits h WHERE h.at > now() - interval '24 hours')
    FROM demo_limits l WHERE l.singleton;
END;
$$;

-- Admin: p_daily_cap NULL removes the cap, 0 pauses the public demo.
CREATE OR REPLACE FUNCTION admin_set_demo_limits(p_daily_cap int, p_per_visitor int) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_daily_cap IS NOT NULL AND (p_daily_cap < 0 OR p_daily_cap > 1000000) THEN
    RAISE EXCEPTION 'daily cap must be empty or between 0 and 1000000';
  END IF;
  IF p_per_visitor IS NULL OR p_per_visitor < 1 OR p_per_visitor > 100 THEN
    RAISE EXCEPTION 'per visitor limit must be between 1 and 100';
  END IF;
  UPDATE demo_limits SET daily_cap = p_daily_cap, per_visitor = p_per_visitor, updated_at = now()
   WHERE singleton;
END;
$$;

REVOKE ALL ON FUNCTION admin_get_demo_limits() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_set_demo_limits(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_get_demo_limits() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_demo_limits(int, int) TO authenticated;

-- ── 2. Time-limited demo accounts ───────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz;
COMMENT ON COLUMN users.demo_expires_at IS
  'When set, this login is a prospect demo and stops working at this time. NULL means a normal account.';

-- Only admin_set_demo_expiry() (which runs as the function owner) may change
-- the column. Signed-in users and the anon key cannot, whatever column grants
-- the table has, so a demo cannot extend itself.
CREATE OR REPLACE FUNCTION guard_demo_expiry() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.demo_expires_at IS DISTINCT FROM OLD.demo_expires_at
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'permission denied for column demo_expires_at' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_demo_expiry ON users;
CREATE TRIGGER guard_demo_expiry
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_demo_expiry();

-- Bans logins whose demo period has ended. A banned login cannot sign in or
-- refresh its session, so access ends within the access token lifetime.
CREATE OR REPLACE FUNCTION expire_demo_accounts() RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  n int;
BEGIN
  UPDATE auth.users au
     SET banned_until = now() + interval '100 years'
   WHERE au.id IN (
           SELECT u.id FROM public.users u
            WHERE u.demo_expires_at IS NOT NULL AND u.demo_expires_at <= now()
         )
     AND (au.banned_until IS NULL OR au.banned_until < now() + interval '50 years');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION expire_demo_accounts() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('expire-demo-accounts', '*/15 * * * *', 'SELECT expire_demo_accounts()');

-- Admin: p_days > 0 makes the login a demo that ends p_days from now (and
-- lifts any earlier ban); NULL or 0 makes it a normal account again.
CREATE OR REPLACE FUNCTION admin_set_demo_expiry(p_user uuid, p_days int) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  expires timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_user = auth.uid() THEN
    RAISE EXCEPTION 'cannot change your own account';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user AND u.role = 'admin') THEN
    RAISE EXCEPTION 'cannot limit an admin account';
  END IF;
  IF p_days IS NOT NULL AND (p_days < 0 OR p_days > 90) THEN
    RAISE EXCEPTION 'days must be between 1 and 90';
  END IF;

  expires := CASE WHEN COALESCE(p_days, 0) > 0 THEN now() + make_interval(days => p_days) END;

  UPDATE public.users SET demo_expires_at = expires WHERE id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such user'; END IF;

  UPDATE auth.users SET banned_until = NULL WHERE id = p_user;
  RETURN expires;
END;
$$;

REVOKE ALL ON FUNCTION admin_set_demo_expiry(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_demo_expiry(uuid, int) TO authenticated;

-- The directory gains the expiry, so the return type changes: drop and recreate.
DROP FUNCTION IF EXISTS admin_list_users();
CREATE FUNCTION admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  role text,
  business_id uuid,
  business_name text,
  must_change_password boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  demo_expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT au.id,
         au.email::text,
         pu.full_name,
         pu.role,
         pu.business_id,
         b.name,
         COALESCE(pu.must_change_password, false),
         au.created_at,
         au.last_sign_in_at,
         au.email_confirmed_at,
         pu.demo_expires_at
    FROM auth.users au
    LEFT JOIN users pu ON pu.id = au.id
    LEFT JOIN businesses b ON b.id = pu.business_id
   ORDER BY au.last_sign_in_at DESC NULLS LAST, au.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_list_users() TO authenticated;

COMMIT;
