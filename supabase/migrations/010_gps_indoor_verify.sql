-- =============================================================================
-- GPS schema catch-up (idempotent): multi-point locations + indoor verification
-- Safe to run multiple times in Supabase SQL Editor.
-- Covers: 009_shop_gps_locations + 010 indoor/tier audit columns
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) shop_gps_locations (multiple GPS points per shop; adaptive radius per point)
-- -----------------------------------------------------------------------------
create table if not exists public.shop_gps_locations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  allowed_radius_meters integer not null default 50,
  location_type text not null default 'main',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_gps_locations_shop_idx
  on public.shop_gps_locations (shop_id, is_active, sort_order);

comment on table public.shop_gps_locations is
  'GPS verification points; staff pass if within any active point (adaptive radius uses allowed_radius_meters + accuracy).';
comment on column public.shop_gps_locations.location_type is
  'main | office | parking | loading | backup — office/main use indoor-friendly buffers when indoor profile applies.';
comment on column public.shop_gps_locations.allowed_radius_meters is
  'Base radius (m) before adaptive accuracy buffer is applied at punch time.';

-- location_type check (table may exist from partial 009 without constraint)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.shop_gps_locations'::regclass
      and conname = 'shop_gps_locations_location_type_check'
  ) then
    alter table public.shop_gps_locations
      add constraint shop_gps_locations_location_type_check
      check (location_type in ('main', 'office', 'parking', 'loading', 'backup'));
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2) shops.gps_indoor_mode (force lenient indoor/high-rise rules for all points)
-- -----------------------------------------------------------------------------
alter table public.shops
  add column if not exists gps_indoor_mode boolean;

update public.shops
set gps_indoor_mode = false
where gps_indoor_mode is null;

alter table public.shops
  alter column gps_indoor_mode set default false;

alter table public.shops
  alter column gps_indoor_mode set not null;

comment on column public.shops.gps_indoor_mode is
  'Indoor Confidence Mode (default off). On: multi-sample GPS, confidence, indoor fallback.';
  'When true, use lenient indoor adaptive-radius rules for every GPS point at this shop.';

-- -----------------------------------------------------------------------------
-- 3) attendance: matched GPS point (from multi-point verify)
-- -----------------------------------------------------------------------------
alter table public.attendance
  add column if not exists matched_gps_location_id uuid;

alter table public.attendance
  add column if not exists matched_gps_location_name text;

alter table public.attendance
  add column if not exists matched_gps_location_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conname = 'attendance_matched_gps_location_id_fkey'
  ) then
    alter table public.attendance
      add constraint attendance_matched_gps_location_id_fkey
      foreign key (matched_gps_location_id)
      references public.shop_gps_locations (id)
      on delete set null;
  end if;
end
$$;

comment on column public.attendance.matched_gps_location_name is
  'Which verification point matched at punch time.';
comment on column public.attendance.matched_gps_location_type is
  'Type of matched point (main, office, etc.).';

-- -----------------------------------------------------------------------------
-- 4) attendance: verification tier + indoor audit (adaptive-radius punch outcome)
-- -----------------------------------------------------------------------------
alter table public.attendance
  add column if not exists gps_verify_tier text;

alter table public.attendance
  add column if not exists gps_sample_count integer;

alter table public.attendance
  add column if not exists gps_sample_spread_meters double precision;

alter table public.attendance
  add column if not exists gps_indoor_session_used boolean;

alter table public.attendance
  add column if not exists gps_review_required boolean;

update public.attendance
set gps_indoor_session_used = false
where gps_indoor_session_used is null;

update public.attendance
set gps_review_required = false
where gps_review_required is null;

alter table public.attendance
  alter column gps_indoor_session_used set default false;

alter table public.attendance
  alter column gps_review_required set default false;

alter table public.attendance
  alter column gps_indoor_session_used set not null;

alter table public.attendance
  alter column gps_review_required set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conname = 'attendance_gps_verify_tier_check'
  ) then
    alter table public.attendance
      add constraint attendance_gps_verify_tier_check
      check (
        gps_verify_tier is null
        or gps_verify_tier in (
          'verified',
          'weak_indoor',
          'rejected',
          'review_required'
        )
      );
  end if;
end
$$;

comment on column public.attendance.gps_verify_tier is
  'verified | weak_indoor | rejected | review_required — admin GPS status label.';
comment on column public.attendance.gps_sample_count is
  'Number of GPS samples aggregated at punch.';
comment on column public.attendance.gps_sample_spread_meters is
  'Max spread (m) between samples at punch.';
comment on column public.attendance.gps_indoor_session_used is
  'True when punch used short-term remembered indoor location grace.';
comment on column public.attendance.gps_review_required is
  'True when admin should review borderline GPS punch.';

-- -----------------------------------------------------------------------------
-- 5) Legacy shop coords → first shop_gps_locations row (if none yet)
-- -----------------------------------------------------------------------------
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
    select 1
    from public.shop_gps_locations g
    where g.shop_id = s.id
  );
