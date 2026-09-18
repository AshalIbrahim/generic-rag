create table if not exists shares (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_type text not null check (resource_type in ('lead','property','conversation')),
  resource_id uuid not null,
  shared_with_account_id uuid not null references accounts(id) on delete cascade,
  shared_by_account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, resource_type, resource_id, shared_with_account_id)
);

create index if not exists idx_shares_lookup on shares(resource_type, resource_id, shared_with_account_id);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_account_id uuid references accounts(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_tenant_time on audit_log(tenant_id, created_at desc);
