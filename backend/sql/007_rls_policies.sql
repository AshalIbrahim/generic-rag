alter table tenants enable row level security;
alter table accounts enable row level security;
alter table locations enable row level security;
alter table amenities enable row level security;
alter table location_sentiments enable row level security;
alter table properties enable row level security;
alter table property_amenities enable row level security;
alter table property_images enable row level security;
alter table leads enable row level security;
alter table sales enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table follow_ups enable row level security;
alter table shares enable row level security;
alter table audit_log enable row level security;

create or replace function app_account()
returns accounts
language sql
stable
security definer
set search_path = public
as $$
  select * from accounts where id = auth.uid() and is_active = true limit 1
$$;

create or replace function app_is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from accounts
    where id = auth.uid()
      and is_active = true
      and role in ('owner','admin')
  )
$$;

create or replace function app_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from accounts where id = auth.uid() and is_active = true limit 1
$$;

create or replace function app_has_share(resource_type_arg text, resource_id_arg uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from shares
    where tenant_id = app_tenant_id()
      and resource_type = resource_type_arg
      and resource_id = resource_id_arg
      and shared_with_account_id = auth.uid()
  )
$$;

drop policy if exists tenants_member_read on tenants;
create policy tenants_member_read on tenants
for select using (id = app_tenant_id());

drop policy if exists accounts_tenant_read on accounts;
create policy accounts_tenant_read on accounts
for select using (tenant_id = app_tenant_id());

drop policy if exists properties_member_read on properties;
create policy properties_member_read on properties
for select using (
  tenant_id = app_tenant_id()
  and (app_is_manager() or agent_id = auth.uid() or app_has_share('property', id))
);

drop policy if exists properties_member_insert on properties;
create policy properties_member_insert on properties
for insert with check (tenant_id = app_tenant_id() and (app_is_manager() or agent_id = auth.uid()));

drop policy if exists properties_member_update on properties;
create policy properties_member_update on properties
for update using (tenant_id = app_tenant_id() and (app_is_manager() or agent_id = auth.uid()))
with check (tenant_id = app_tenant_id());

drop policy if exists property_images_member on property_images;
create policy property_images_member on property_images
for all using (
  tenant_id = app_tenant_id()
  and exists (
    select 1 from properties p
    where p.id = property_id
      and p.tenant_id = app_tenant_id()
      and (app_is_manager() or p.agent_id = auth.uid() or app_has_share('property', p.id))
  )
)
with check (tenant_id = app_tenant_id());

drop policy if exists leads_member_read on leads;
create policy leads_member_read on leads
for select using (
  tenant_id = app_tenant_id()
  and (app_is_manager() or assigned_agent_id = auth.uid() or app_has_share('lead', id))
);

drop policy if exists leads_member_write on leads;
create policy leads_member_write on leads
for all using (tenant_id = app_tenant_id() and (app_is_manager() or assigned_agent_id = auth.uid()))
with check (tenant_id = app_tenant_id());

drop policy if exists sales_member on sales;
create policy sales_member on sales
for all using (tenant_id = app_tenant_id() and (app_is_manager() or agent_id = auth.uid()))
with check (tenant_id = app_tenant_id());

drop policy if exists conversations_member on conversations;
create policy conversations_member on conversations
for all using (
  tenant_id = app_tenant_id()
  and (app_is_manager() or assigned_agent_id = auth.uid() or app_has_share('conversation', id))
)
with check (tenant_id = app_tenant_id());

drop policy if exists messages_member_read on conversation_messages;
create policy messages_member_read on conversation_messages
for select using (
  exists (
    select 1 from conversations c
    where c.id = conversation_id
      and c.tenant_id = app_tenant_id()
      and (app_is_manager() or c.assigned_agent_id = auth.uid() or app_has_share('conversation', c.id))
  )
);

drop policy if exists followups_member on follow_ups;
create policy followups_member on follow_ups
for all using (tenant_id = app_tenant_id() and (app_is_manager() or assigned_agent_id = auth.uid()))
with check (tenant_id = app_tenant_id());

drop policy if exists shares_member on shares;
create policy shares_member on shares
for all using (tenant_id = app_tenant_id() and (app_is_manager() or shared_by_account_id = auth.uid() or shared_with_account_id = auth.uid()))
with check (tenant_id = app_tenant_id());

drop policy if exists audit_manager_read on audit_log;
create policy audit_manager_read on audit_log
for select using (tenant_id = app_tenant_id() and app_is_manager());

drop policy if exists public_reference_read_locations on locations;
create policy public_reference_read_locations on locations for select using (true);

drop policy if exists public_reference_read_amenities on amenities;
create policy public_reference_read_amenities on amenities for select using (true);

drop policy if exists public_active_properties_read on properties;
create policy public_active_properties_read on properties
for select using (status = 'active');

drop policy if exists public_active_images_read on property_images;
create policy public_active_images_read on property_images
for select using (
  exists (
    select 1 from properties p
    where p.id = property_id and p.status = 'active'
  )
);
