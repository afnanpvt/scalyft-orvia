-- Add must_change_password flag for invite / temp-password flows.
-- When set to true, the dashboard redirects the user to /reset-password
-- after sign-in and blocks all other routes until the flag is cleared.
-- Cleared automatically by AuthContext.clearMustChangePassword() after
-- a successful password update.

BEGIN;

ALTER TABLE users
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.must_change_password IS
  'When true, user is on a temp password from an invite and must set a real one before accessing the dashboard. Cleared after successful password update.';

COMMIT;
