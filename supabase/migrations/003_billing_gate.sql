BEGIN;

-- Billing columns on businesses
ALTER TABLE businesses
  ADD COLUMN seconds_remaining INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN allow_overage     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN owner_phone       TEXT;

-- Atomic decrement — returns new balance after deduction.
-- Always subtracts the full amount (allowing negative for overage tracking).
-- Called by vapi-events end-of-call-report.
CREATE OR REPLACE FUNCTION deduct_call_seconds(p_business_id UUID, p_seconds INTEGER)
RETURNS INTEGER
LANGUAGE sql
AS $$
  UPDATE businesses
  SET seconds_remaining = seconds_remaining - p_seconds
  WHERE id = p_business_id
  RETURNING seconds_remaining;
$$;

COMMIT;
