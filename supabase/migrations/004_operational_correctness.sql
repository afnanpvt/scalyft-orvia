BEGIN;

-- Phase 0: correctness columns on calls

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS transcript_status  TEXT NOT NULL DEFAULT 'pending'
    CHECK (transcript_status IN ('pending', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS ai_failure_reason  TEXT,
  ADD COLUMN IF NOT EXISTS was_concurrent     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMPTZ;

-- Back-fill: calls already completed have a complete transcript
UPDATE calls
  SET transcript_status = 'complete'
  WHERE status = 'completed'
    AND transcript IS NOT NULL;

-- Back-fill: calls already failed should not sit as 'pending'
UPDATE calls
  SET transcript_status = 'failed'
  WHERE status IN ('failed', 'missed')
    AND transcript_status = 'pending';

-- Index used by concurrent-call detection (checked on every call.started)
CREATE INDEX IF NOT EXISTS idx_calls_inprogress_business
  ON calls(business_id, status)
  WHERE status = 'in_progress';

-- Index for caller-phone lookups (repeat caller detection, queue priority)
CREATE INDEX IF NOT EXISTS idx_calls_caller_phone
  ON calls(caller_phone, business_id, created_at DESC)
  WHERE caller_phone IS NOT NULL;

COMMIT;
