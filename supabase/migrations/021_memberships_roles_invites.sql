-- 008: real multi-user tenancy
--  * memberships: one login can belong to several businesses (UI exposes a switcher; single-tenant today)
--  * roles: owner / admin / staff / viewer, ENFORCED in row-level security
--  * invites: owners/admins invite by email; the person signs in (Google or password) and is let in
--  * closes a privilege hole: users could UPDATE their own business_id/role and read another tenant
--  * businesses.vertical + businesses.region (us | in | uk)
-- users.business_id stays the user's ACTIVE business, so existing queries (scoped by RLS) keep working.

BEGIN;

-- ── Tenant attributes ───────────────────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS vertical TEXT NOT NULL DEFAULT 'home_services',
  ADD COLUMN IF NOT EXISTS region   TEXT NOT NULL DEFAULT 'us'
    CHECK (region IN ('us','in','uk'));
COMMENT ON COLUMN businesses.vertical IS 'Industry template key, e.g. home_services, dental. Drives prompt/service templates.';
COMMENT ON COLUMN businesses.region   IS 'us | in | uk. Drives phone provider, currency, consent wording, defaults.';

-- ── Memberships ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner','admin','staff','viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_business ON memberships(business_id);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','admin','staff','viewer'));

INSERT INTO memberships (user_id, business_id, role)
SELECT id, business_id, role FROM users WHERE business_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Any new users row with a business automatically gets a membership (covers onboard-business).
CREATE OR REPLACE FUNCTION users_create_membership() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.business_id IS NOT NULL THEN
    INSERT INTO memberships (user_id, business_id, role)
    VALUES (NEW.id, NEW.business_id, NEW.role)
    ON CONFLICT (user_id, business_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_membership_ins ON users;
CREATE TRIGGER users_membership_ins AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION users_create_membership();

-- ── Invites ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin','staff','viewer')),
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days',
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS invites_pending_unique
  ON invites (business_id, lower(email)) WHERE accepted_at IS NULL;

-- ── Helpers (SECURITY DEFINER so policies don't recurse) ────────────────────
CREATE OR REPLACE FUNCTION auth_business_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.business_id FROM users u
  JOIN memberships m ON m.user_id = u.id AND m.business_id = u.business_id
  WHERE u.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role FROM users u
  JOIN memberships m ON m.user_id = u.id AND m.business_id = u.business_id
  WHERE u.id = auth.uid()
$$;

-- ── Guards: stop self-promotion / tenant hopping and billing tampering ──────
CREATE OR REPLACE FUNCTION users_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated'
     AND coalesce(current_setting('orvia.allow_user_admin', true), '') <> '1'
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.business_id IS DISTINCT FROM OLD.business_id) THEN
    RAISE EXCEPTION 'role / business can only be changed through the team functions';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_guard_upd ON users;
CREATE TRIGGER users_guard_upd BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_guard();

CREATE OR REPLACE FUNCTION businesses_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' AND (
       NEW.plan IS DISTINCT FROM OLD.plan OR NEW.calls_included IS DISTINCT FROM OLD.calls_included
    OR NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end
    OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
    OR NEW.billing_status IS DISTINCT FROM OLD.billing_status
    OR NEW.seconds_remaining IS DISTINCT FROM OLD.seconds_remaining
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.vapi_phone_id IS DISTINCT FROM OLD.vapi_phone_id
    OR NEW.vapi_assistant_id IS DISTINCT FROM OLD.vapi_assistant_id
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.region IS DISTINCT FROM OLD.region OR NEW.vertical IS DISTINCT FROM OLD.vertical
  ) THEN
    RAISE EXCEPTION 'billing / provisioning fields are managed by Orvia';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS businesses_guard_upd ON businesses;
CREATE TRIGGER businesses_guard_upd BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION businesses_guard();

-- ── Row-level security: roles enforced ──────────────────────────────────────
-- owner/admin: everything incl. settings + delete. staff: read + work leads/calls/appointments.
-- viewer: read only.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_business" ON businesses;
CREATE POLICY businesses_select ON businesses FOR SELECT USING (id = auth_business_id());
CREATE POLICY businesses_update ON businesses FOR UPDATE
  USING (id = auth_business_id() AND auth_role() IN ('owner','admin'))
  WITH CHECK (id = auth_business_id());

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['calls','leads','appointments','operational_events','call_queue'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_own_business" ON %I', t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (business_id = auth_business_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (business_id = auth_business_id() AND auth_role() IN (''owner'',''admin'',''staff''))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (business_id = auth_business_id() AND auth_role() IN (''owner'',''admin'',''staff'')) WITH CHECK (business_id = auth_business_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (business_id = auth_business_id() AND auth_role() IN (''owner'',''admin''))', t || '_delete', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "users_own_record" ON users;
CREATE POLICY users_select ON users FOR SELECT USING (id = auth.uid() OR business_id = auth_business_id());
CREATE POLICY users_update_self ON users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY memberships_select ON memberships FOR SELECT
  USING (user_id = auth.uid() OR business_id = auth_business_id());
CREATE POLICY invites_select ON invites FOR SELECT
  USING (business_id = auth_business_id() AND auth_role() IN ('owner','admin'));

-- ── Team RPCs (the only write path for roles/invites/active business) ───────
CREATE OR REPLACE FUNCTION my_memberships()
RETURNS TABLE (business_id UUID, name TEXT, role TEXT, is_active BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.business_id, b.name, m.role, (m.business_id = u.business_id)
  FROM memberships m
  JOIN businesses b ON b.id = m.business_id
  LEFT JOIN users u ON u.id = m.user_id
  WHERE m.user_id = auth.uid()
  ORDER BY b.name
$$;

CREATE OR REPLACE FUNCTION switch_business(p_business_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r TEXT;
BEGIN
  SELECT role INTO r FROM memberships WHERE user_id = auth.uid() AND business_id = p_business_id;
  IF r IS NULL THEN RAISE EXCEPTION 'not a member of that business'; END IF;
  PERFORM set_config('orvia.allow_user_admin', '1', true);
  UPDATE users SET business_id = p_business_id, role = r WHERE id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION invite_member(p_email TEXT, p_role TEXT) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE biz UUID := auth_business_id(); me TEXT := auth_role(); inv UUID;
BEGIN
  IF me NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_role NOT IN ('admin','staff','viewer') THEN RAISE EXCEPTION 'invalid role'; END IF;
  IF me = 'admin' AND p_role = 'admin' THEN RAISE EXCEPTION 'only owners can invite admins'; END IF;
  INSERT INTO invites (business_id, email, role, invited_by)
  VALUES (biz, lower(trim(p_email)), p_role, auth.uid())
  ON CONFLICT (business_id, lower(email)) WHERE accepted_at IS NULL
  DO UPDATE SET role = EXCLUDED.role, expires_at = now() + interval '14 days'
  RETURNING id INTO inv;
  RETURN inv;
END $$;

CREATE OR REPLACE FUNCTION revoke_invite(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth_role() NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  DELETE FROM invites WHERE id = p_id AND business_id = auth_business_id() AND accepted_at IS NULL;
END $$;

-- Called after every sign-in. Matches the VERIFIED login email to pending invites.
CREATE OR REPLACE FUNCTION accept_pending_invites() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE em TEXT; n INTEGER := 0; i RECORD;
BEGIN
  SELECT lower(email) INTO em FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF em IS NULL THEN RETURN 0; END IF;
  FOR i IN SELECT * FROM invites WHERE lower(email) = em AND accepted_at IS NULL AND expires_at > now() LOOP
    PERFORM set_config('orvia.allow_user_admin', '1', true);
    INSERT INTO users (id, business_id, email, role) VALUES (auth.uid(), i.business_id, em, i.role)
      ON CONFLICT (id) DO UPDATE SET business_id = COALESCE(users.business_id, EXCLUDED.business_id),
                                     role = CASE WHEN users.business_id IS NULL THEN EXCLUDED.role ELSE users.role END;
    INSERT INTO memberships (user_id, business_id, role) VALUES (auth.uid(), i.business_id, i.role)
      ON CONFLICT (user_id, business_id) DO NOTHING;
    UPDATE invites SET accepted_at = now() WHERE id = i.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION set_member_role(p_user_id UUID, p_role TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE biz UUID := auth_business_id(); me TEXT := auth_role(); cur TEXT; owners INTEGER;
BEGIN
  IF me NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_role NOT IN ('owner','admin','staff','viewer') THEN RAISE EXCEPTION 'invalid role'; END IF;
  SELECT role INTO cur FROM memberships WHERE user_id = p_user_id AND business_id = biz;
  IF cur IS NULL THEN RAISE EXCEPTION 'not a member'; END IF;
  IF me = 'admin' AND (cur IN ('owner','admin') OR p_role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'admins can only manage staff and viewers';
  END IF;
  IF cur = 'owner' AND p_role <> 'owner' THEN
    SELECT count(*) INTO owners FROM memberships WHERE business_id = biz AND role = 'owner';
    IF owners <= 1 THEN RAISE EXCEPTION 'a business needs at least one owner'; END IF;
  END IF;
  UPDATE memberships SET role = p_role WHERE user_id = p_user_id AND business_id = biz;
  PERFORM set_config('orvia.allow_user_admin', '1', true);
  UPDATE users SET role = p_role WHERE id = p_user_id AND business_id = biz;
END $$;

CREATE OR REPLACE FUNCTION remove_member(p_user_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE biz UUID := auth_business_id(); me TEXT := auth_role(); cur TEXT; owners INTEGER; nxt RECORD;
BEGIN
  IF me NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'you cannot remove yourself'; END IF;
  SELECT role INTO cur FROM memberships WHERE user_id = p_user_id AND business_id = biz;
  IF cur IS NULL THEN RETURN; END IF;
  IF me = 'admin' AND cur IN ('owner','admin') THEN RAISE EXCEPTION 'admins can only remove staff and viewers'; END IF;
  IF cur = 'owner' THEN
    SELECT count(*) INTO owners FROM memberships WHERE business_id = biz AND role = 'owner';
    IF owners <= 1 THEN RAISE EXCEPTION 'a business needs at least one owner'; END IF;
  END IF;
  DELETE FROM memberships WHERE user_id = p_user_id AND business_id = biz;
  PERFORM set_config('orvia.allow_user_admin', '1', true);
  SELECT business_id, role INTO nxt FROM memberships WHERE user_id = p_user_id LIMIT 1;
  UPDATE users SET business_id = nxt.business_id, role = COALESCE(nxt.role, role)
   WHERE id = p_user_id AND business_id = biz;
END $$;

REVOKE ALL ON FUNCTION my_memberships(), switch_business(UUID), invite_member(TEXT, TEXT), revoke_invite(UUID),
  accept_pending_invites(), set_member_role(UUID, TEXT), remove_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_memberships(), switch_business(UUID), invite_member(TEXT, TEXT), revoke_invite(UUID),
  accept_pending_invites(), set_member_role(UUID, TEXT), remove_member(UUID) TO authenticated;

COMMIT;
