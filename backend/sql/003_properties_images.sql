create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  agent_id uuid references accounts(id) on delete set null,
  location_id uuid references locations(id),
  title text not null,
  description text,
  prop_type text not null check (prop_type in ('House','Apartment','Condo','Townhouse','Land','Commercial')),
  purpose text not null check (purpose in ('For Sale','For Rent')),
  price numeric not null check (price > 0),
  covered_area numeric not null check (covered_area > 0),
  area_unit text not null default 'sqft',
  beds int not null default 0 check (beds >= 0),
  baths int not null default 0 check (baths >= 0),
  year_built int,
  parking_spaces int default 0,
  address_line text,
  zip_code text,
  status text not null default 'draft' check (status in ('draft','active','pending','sold','rented','archived')),
  is_featured boolean not null default false,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_properties_tenant on properties(tenant_id);
create index if not exists idx_properties_agent on properties(agent_id);
create index if not exists idx_properties_location on properties(location_id);
create index if not exists idx_properties_status on properties(status);
create index if not exists idx_properties_price on properties(price);
create index if not exists idx_properties_search on properties(tenant_id, status, purpose, prop_type);

create table if not exists property_amenities (
  property_id uuid references properties(id) on delete cascade,
  amenity_id int references amenities(id) on delete cascade,
  primary key (property_id, amenity_id)
);

create table if not exists property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  storage_path text not null,
  thumbnail_path text,
  is_primary boolean not null default false,
  sort_order int not null default 0,
  file_size_bytes int,
  checksum text,
  uploaded_by uuid references accounts(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_images_property on property_images(property_id);

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists properties_touch on properties;
create trigger properties_touch before update on properties
for each row execute function touch_updated_at();
