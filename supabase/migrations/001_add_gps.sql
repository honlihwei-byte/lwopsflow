-- Run on an existing database (after initial schema.sql without GPS columns).

alter table public.shops
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists allowed_radius_meters integer not null default 50;

alter table public.attendance
  add column if not exists staff_latitude double precision,
  add column if not exists staff_longitude double precision,
  add column if not exists distance_from_shop_meters double precision,
  add column if not exists gps_verified boolean not null default false;

comment on column public.shops.allowed_radius_meters is 'Max distance (m) from shop coords for clock in/out.';
comment on column public.attendance.gps_verified is 'True when staff was within allowed_radius_meters at punch time.';
