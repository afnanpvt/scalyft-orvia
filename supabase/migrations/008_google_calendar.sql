-- Google Calendar sync: one OAuth connection per business, plus a short-lived
-- state table used only to survive the redirect round-trip to Google (CSRF
-- protection + carries business_id since Google's redirect back has no auth
-- header). google_oauth_states rows are deleted the instant they're consumed.

BEGIN;

CREATE TABLE google_calendar_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
    google_email TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    calendar_id TEXT NOT NULL DEFAULT 'primary',
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;

-- Members can see/disconnect their own business's connection. Row content
-- (tokens) is written only by edge functions using the service role key,
-- which bypasses RLS entirely — this policy just governs client-side reads
-- and the disconnect (delete) button in Settings.
CREATE POLICY "google_calendar_connections_own_business" ON google_calendar_connections
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND business_id = google_calendar_connections.business_id)
    );

CREATE POLICY "google_calendar_connections_delete_own_business" ON google_calendar_connections
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND business_id = google_calendar_connections.business_id)
    );

CREATE TRIGGER google_calendar_connections_updated_at
    BEFORE UPDATE ON google_calendar_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE google_oauth_states (
    state TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS needed: only ever touched by edge functions via the service role key.
ALTER TABLE google_oauth_states ENABLE ROW LEVEL SECURITY;

COMMIT;
