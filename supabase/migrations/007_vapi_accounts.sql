-- Platform-wide vault of Vapi accounts (not tenant-scoped — used to rotate
-- between multiple free-trial Vapi orgs for demo/testing). Balance is entered
-- manually since Vapi has no public API for it. Admin-only, enforced by RLS.

BEGIN;

CREATE TABLE vapi_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    public_key TEXT NOT NULL,
    private_key TEXT,
    balance_usd NUMERIC(10, 2),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'disabled')),
    is_active BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one account can be the active one at a time.
CREATE UNIQUE INDEX vapi_accounts_one_active ON vapi_accounts (is_active) WHERE is_active = true;

ALTER TABLE vapi_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vapi_accounts_admin_only" ON vapi_accounts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

CREATE TRIGGER vapi_accounts_updated_at
    BEFORE UPDATE ON vapi_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
