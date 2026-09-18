create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  assigned_agent_id uuid references accounts(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  source_channel text not null default 'manual',
  status text not null default 'new' check (status in ('new','contacted','qualified','showing','offer','closed','lost')),
  budget_min numeric,
  budget_max numeric,
  preferred_location text,
  preferences jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_tenant_agent on leads(tenant_id, assigned_agent_id);
create index if not exists idx_leads_status on leads(status);

drop trigger if exists leads_touch on leads;
create trigger leads_touch before update on leads
for each row execute function touch_updated_at();

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  property_id uuid not null references properties(id),
  lead_id uuid references leads(id) on delete set null,
  agent_id uuid references accounts(id) on delete set null,
  buyer_name text not null,
  buyer_email text,
  buyer_phone text,
  sold_price numeric not null check (sold_price > 0),
  deposit_amount numeric,
  commission_rate numeric,
  commission_amount numeric,
  payment_status text,
  financing_type text,
  offer_date date,
  contract_date date,
  closing_date date,
  possession_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_tenant_agent on sales(tenant_id, agent_id);
create index if not exists idx_sales_property on sales(property_id);

drop trigger if exists sales_touch on sales;
create trigger sales_touch before update on sales
for each row execute function touch_updated_at();
