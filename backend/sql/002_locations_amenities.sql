create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  city text not null,
  state text not null,
  country text not null default 'USA',
  latitude numeric,
  longitude numeric,
  created_at timestamptz not null default now(),
  unique (area, city, state, country)
);

create index if not exists idx_locations_city on locations(city);

create table if not exists amenities (
  id serial primary key,
  name text not null unique,
  category text,
  icon text
);

create table if not exists location_sentiments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  water_sentiment text,
  electricity_sentiment text,
  gas_sentiment text,
  traffic_sentiment text,
  safety_sentiment text,
  school_rating text,
  raw_analysis text,
  updated_at timestamptz not null default now(),
  unique (location_id)
);
