-- 007: US home-services launch pack
--  * address/ZIP/issue capture on leads + appointments
--  * precise per-call cost + breakdown, owner-notified flag
--  * plan / call-quota / hard-cap / Stripe columns on businesses
--  * monthly usage view for per-customer calls, minutes, cost

BEGIN;

-- ── Leads & appointments: where is the job, what is wrong ───────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS zip     TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS zip     TEXT,
  ADD COLUMN IF NOT EXISTS urgency TEXT;

-- ── Calls: exact cost + notification bookkeeping ────────────────────────────
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS cost_usd        NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS cost_breakdown  JSONB,
  ADD COLUMN IF NOT EXISTS owner_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transfer_attempted BOOLEAN NOT NULL DEFAULT false;

-- ── Businesses: plan, quota, hard cap, billing ──────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS plan                   TEXT
    CHECK (plan IN ('trial','solo','pro','scale')),
  ADD COLUMN IF NOT EXISTS calls_included         INTEGER,
  ADD COLUMN IF NOT EXISTS overage_cap_calls      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_start           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_end             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trade                  TEXT
    CHECK (trade IN ('hvac','plumbing','electrical','other')),
  ADD COLUMN IF NOT EXISTS notification_email     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_status         TEXT
    CHECK (billing_status IN ('trialing','active','past_due','canceled'));

CREATE UNIQUE INDEX IF NOT EXISTS businesses_stripe_customer_unique
  ON businesses(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN businesses.plan IS
  'NULL = legacy seconds_remaining billing. Otherwise calls are metered against calls_included (+ overage_cap_calls if allow_overage).';

-- ── Quota helper: calls used in the current period ──────────────────────────
-- Counts every call that reached the AI (not no-answer/voicemail "missed").
CREATE OR REPLACE FUNCTION calls_used_in_period(p_business_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM calls c
  JOIN businesses b ON b.id = c.business_id
  WHERE c.business_id = p_business_id
    AND c.status <> 'missed'
    AND c.created_at >= COALESCE(b.period_start, date_trunc('month', now()));
$$;

-- ── Monthly usage per business (RLS applies to the caller) ──────────────────
CREATE OR REPLACE VIEW business_usage_monthly
WITH (security_invoker = true) AS
SELECT
  business_id,
  date_trunc('month', created_at)                          AS month,
  COUNT(*) FILTER (WHERE status <> 'missed')               AS calls,
  COALESCE(SUM(duration_secs), 0)                          AS seconds,
  ROUND(COALESCE(SUM(duration_secs), 0) / 60.0, 1)         AS minutes,
  COALESCE(SUM(COALESCE(cost_usd, cost_cents / 100.0)), 0) AS cost_usd,
  CASE WHEN SUM(duration_secs) > 0
       THEN ROUND(SUM(COALESCE(cost_usd, cost_cents / 100.0)) / (SUM(duration_secs) / 60.0), 4)
  END                                                      AS cost_per_minute_usd
FROM calls
GROUP BY business_id, date_trunc('month', created_at);

COMMIT;
