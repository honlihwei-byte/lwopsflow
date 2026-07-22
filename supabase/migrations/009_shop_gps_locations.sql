-- Multiple GPS verification points per shop.

create table if not exists public.shop_gps_locations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  allowed_radius_meters integer not null default 50,
  location_type text not null default 'main'
    check (location_type in ('main', 'office', 'parking', 'loading', 'backup')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_gps_locations_shop_idx
  on public.shop_gps_locations (shop_id, is_active, sort_order);

comment on table public.shop_gps_locations is 'GPS verification points; staff pass if within any active point.';
comment on column public.shop_gps_locations.location_type is 'main | office | parking | loading | backup';

alter table public.attendance
  add column if not exists matched_gps_location_id uuid references public.shop_gps_locations (id) on delete set null,
  add column if not exists matched_gps_location_name text,
  add column if not exists matched_gps_location_type text;

comment on column public.attendance.matched_gps_location_name is 'Which verification point matched at punch time.';
comment on column public.attendance.matched_gps_location_type is 'Type of matched point (main, office, etc.).';

-- Seed legacy shop GPS as a main location where none exist yet.
insert into public.shop_gps_locations (
  shop_id,
  name,
  latitude,
  longitude,
  allowed_radius_meters,
  location_type,
  is_active,
  sort_order
)
select
  s.id,
  'Main Entrance',
  s.latitude,
  s.longitude,
  coalesce(s.allowed_radius_meters, 50),
  'main',
  true,
  0
from public.shops s
where s.latitude is not null
  and s.longitude is not null
  and not exists (
    select 1 from public.shop_gps_locations g where g.shop_id = s.id
  );
