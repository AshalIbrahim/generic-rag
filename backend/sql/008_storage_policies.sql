insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists property_images_public_read on storage.objects;
create policy property_images_public_read on storage.objects
for select using (bucket_id = 'property-images');

drop policy if exists property_images_tenant_insert on storage.objects;
create policy property_images_tenant_insert on storage.objects
for insert with check (
  bucket_id = 'property-images'
  and split_part(name, '/', 1)::uuid = app_tenant_id()
);

drop policy if exists property_images_tenant_update on storage.objects;
create policy property_images_tenant_update on storage.objects
for update using (
  bucket_id = 'property-images'
  and split_part(name, '/', 1)::uuid = app_tenant_id()
);

drop policy if exists property_images_tenant_delete on storage.objects;
create policy property_images_tenant_delete on storage.objects
for delete using (
  bucket_id = 'property-images'
  and split_part(name, '/', 1)::uuid = app_tenant_id()
);
