create extension if not exists "pgcrypto";

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'trial' check (plan in ('trial','starter','pro','enterprise')),
  status text not null default 'active' check (status in ('active','suspended','cancelled')),
  logo_url text,
  primary_color text default '#2563eb',
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now()
);

create table if not exists accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  role text not null check (role in ('owner','admin','agent')),
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_accounts_tenant on accounts(tenant_id);
create index if not exists idx_accounts_email on accounts(email);

create table if not exists platform_admins (
  account_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
