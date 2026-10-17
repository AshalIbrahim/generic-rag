-- Plotwise: sales, commissions, and the extra CRM columns.
-- Run once in the Supabase SQL editor. Safe to re-run (everything is IF NOT EXISTS).
-- Wrapped in a transaction: if any statement fails, nothing is applied.
BEGIN;

-- ---------- Commission settings (one row per agency; defaults used if no row) ----------
CREATE TABLE IF NOT EXISTS commission_settings (
    tenant_id       INT PRIMARY KEY REFERENCES tenants(id),
    sale_rate_pct   NUMERIC(6,2) NOT NULL DEFAULT 2.00,    -- % of sale price
    rent_rate_pct   NUMERIC(6,2) NOT NULL DEFAULT 100.00,  -- % of ONE month's rent
    agent_split_pct NUMERIC(5,2) NOT NULL DEFAULT 50.00,   -- agent's share of the commission
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Sales (a closed deal: a sale or a rental) ----------
CREATE TABLE IF NOT EXISTS sales (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id         INT NOT NULL REFERENCES tenants(id),
    property_id       INT NOT NULL REFERENCES property_data(id),
    agent_id          INT NOT NULL REFERENCES accounts(id),   -- the agent credited with the deal
    lead_id           INT NULL REFERENCES leads(id),          -- optional: the buyer/tenant lead
    kind              TEXT NOT NULL CHECK (kind IN ('sale','rent')),
    sale_price        NUMERIC(16,2) NOT NULL CHECK (sale_price > 0),
    commission_rate_pct NUMERIC(6,2) NOT NULL,
    gross_commission  NUMERIC(16,2) NOT NULL,
    agent_split_pct   NUMERIC(5,2)  NOT NULL,
    agent_commission  NUMERIC(16,2) NOT NULL,
    agency_commission NUMERIC(16,2) NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
    closed_at         DATE NOT NULL DEFAULT CURRENT_DATE,
    paid_at           TIMESTAMPTZ NULL,
    notes             TEXT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A property can only have one live (non-cancelled) deal at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_property_live ON sales(property_id) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS ix_sales_tenant_agent ON sales(tenant_id, agent_id);

-- ---------- Leads: make sure the columns the CRM code uses exist ----------
-- (Your leads table already exists; these only add what is missing.)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_id         INT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_agent_id INT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name              TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone             TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email             TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes             TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bday              DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS income            NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_investor       BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT now();

-- ---------- Follow-ups ----------
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS tenant_id    INT;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS lead_id      INT;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS agent_id     INT;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS due_at       TIMESTAMPTZ;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS channel      TEXT;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS note         TEXT;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS status       TEXT DEFAULT 'pending';
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS outcome      TEXT;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_leads_tenant_agent ON leads(tenant_id, assigned_agent_id);
CREATE INDEX IF NOT EXISTS ix_followups_tenant_agent_due ON follow_ups(tenant_id, agent_id, due_at);

COMMIT;
