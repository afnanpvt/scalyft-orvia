-- Admin-only directory of everyone who can sign in, across all businesses.
-- Reads auth.users (for last sign-in / confirmation) joined to the app's
-- users + businesses. Starts from auth.users so logins without an app profile
-- (half-provisioned accounts) still show up. Never exposes password hashes.

CREATE OR REPLACE FUNCTION admin_list_users()
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
  email_confirmed_at timestamptz
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
         au.email_confirmed_at
    FROM auth.users au
    LEFT JOIN users pu ON pu.id = au.id
    LEFT JOIN businesses b ON b.id = pu.business_id
   ORDER BY au.last_sign_in_at DESC NULLS LAST, au.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_list_users() TO authenticated;
