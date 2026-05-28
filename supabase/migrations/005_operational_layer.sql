BEGIN;

-- Phase 1: operational_events table
-- Stores discrete operational events that need owner attention.
-- Kept minimal: only the fields required to drive the UI.

CREATE TABLE IF NOT EXISTS operational_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id      UUID REFERENCES calls(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL,
  -- 'ai_failure' | 'concurrent_call' | 'partial_booking' | 'transfer_unknown'
  severity     TEXT NOT NULL DEFAULT 'warning',
  -- 'critical' | 'warning' | 'info'
  resolved     BOOLEAN NOT NULL DEFAULT false,
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE operational_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operational_events_own_business"
  ON operational_events FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_opevents_unresolved
  ON operational_events(business_id, created_at DESC)
  WHERE resolved = false;

-- Phase 1: call_queue table
-- Tracks callbacks and follow-ups that need human action.
-- No automation, no retry orchestration - just a visible queue.

CREATE TABLE IF NOT EXISTS call_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id         UUID REFERENCES calls(id) ON DELETE SET NULL,
  queue_type      TEXT NOT NULL,
  -- 'missed_callback' | 'partial_booking'
  priority        SMALLINT NOT NULL DEFAULT 5,
  -- 1 = highest (emergency), 5 = normal
  caller_phone    TEXT,
  caller_name     TEXT,
  service_needed  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'handled'
  handled_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  handled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE call_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_queue_own_business"
  ON call_queue FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_call_queue_pending
  ON call_queue(business_id, priority, created_at)
  WHERE status = 'pending';

-- Enable Realtime on the new tables
ALTER PUBLICATION supabase_realtime ADD TABLE operational_events;
ALTER PUBLICATION supabase_realtime ADD TABLE call_queue;

COMMIT;
