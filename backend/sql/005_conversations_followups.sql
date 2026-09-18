create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  assigned_agent_id uuid references accounts(id) on delete set null,
  session_id text,
  channel text not null default 'web_widget',
  bot_enabled boolean not null default true,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_tenant_agent on conversations(tenant_id, assigned_agent_id);
create index if not exists idx_conversations_session on conversations(session_id);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','agent','system')),
  content text not null,
  shown_properties jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation on conversation_messages(conversation_id);

drop trigger if exists conversations_touch on conversations;
create trigger conversations_touch before update on conversations
for each row execute function touch_updated_at();

create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  assigned_agent_id uuid references accounts(id) on delete set null,
  title text not null,
  notes text,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','done','snoozed','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_followups_tenant_agent on follow_ups(tenant_id, assigned_agent_id);

drop trigger if exists followups_touch on follow_ups;
create trigger followups_touch before update on follow_ups
for each row execute function touch_updated_at();
