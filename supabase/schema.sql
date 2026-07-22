-- Multi-shop staff attendance — Supabase SQL (new project / full reset).
-- If you have legacy public.punch_logs, back up then: drop table public.punch_logs cascade;
-- If triggers fail on older Postgres, replace "execute function" with "execute procedure" below.

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision,
  longitude double precision,
  allowed_radius_meters integer not null default 50,
  gps_indoor_mode boolean not null default false,
  allow_photo_proof_fallback boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.shops.gps_indoor_mode is
  'Indoor Confidence Mode: multi-sample GPS, confidence score, indoor fallback. Default off for fast retail.';
comment on column public.shops.allow_photo_proof_fallback is
  'Allow live camera photo proof when GPS verification fails.';

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

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  staff_name text not null,
  staff_code text not null,
  staff_type text not null default 'full_time' check (staff_type in ('full_time', 'part_time')),
  id_card_qr_value text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_staff_code_unique on public.staff (staff_code);
create unique index if not exists staff_id_card_qr_unique on public.staff (id_card_qr_value);
create index if not exists staff_status_idx on public.staff (status);
create index if not exists staff_type_idx on public.staff (staff_type);

create table if not exists public.staff_shop_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (staff_id, shop_id)
);

create index if not exists staff_shop_assignments_staff_idx
  on public.staff_shop_assignments (staff_id);
create index if not exists staff_shop_assignments_shop_idx
  on public.staff_shop_assignments (shop_id);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  shop_name text not null,
  staff_id uuid not null references public.staff (id) on delete restrict,
  staff_name text not null,
  staff_code text not null,
  staff_type text not null,
  action_type text not null check (action_type in ('clock_in', 'clock_out', 'rest_in', 'rest_out')),
  event_date date not null,
  event_time text not null,
  staff_latitude double precision,
  staff_longitude double precision,
  distance_from_shop_meters double precision,
  gps_accuracy_meters double precision,
  original_staff_latitude double precision,
  original_staff_longitude double precision,
  original_gps_accuracy_meters double precision,
  gps_corrected_at timestamptz,
  gps_verified boolean not null default false,
  gps_verify_tier text check (
    gps_verify_tier is null
    or gps_verify_tier in ('verified', 'weak_indoor', 'rejected', 'review_required')
  ),
  gps_sample_count integer,
  gps_sample_spread_meters double precision,
  gps_indoor_session_used boolean not null default false,
  gps_review_required boolean not null default false,
  gps_indoor_fallback_used boolean not null default false,
  gps_trusted_window_used boolean not null default false,
  punch_device_id text,
  gps_original_radius_meters double precision,
  gps_expanded_radius_meters double precision,
  location_confidence_score integer check (
    location_confidence_score is null
    or (location_confidence_score >= 0 and location_confidence_score <= 100)
  ),
  matched_gps_location_id uuid references public.shop_gps_locations (id) on delete set null,
  matched_gps_location_name text,
  matched_gps_location_type text,
  photo_proof_used boolean not null default false,
  photo_proof_path text,
  photo_proof_uploaded_at timestamptz,
  photo_proof_original_file_size integer,
  photo_proof_compressed_file_size integer,
  photo_proof_upload_duration_ms integer,
  verification_method text check (
    verification_method is null
    or verification_method in (
      'gps',
      'indoor_confidence',
      'indoor_fallback',
      'photo_proof',
      'manual_approval',
      'gps_verified',
      'gps_weak_indoor'
    )
  ),
  review_required boolean not null default false,
  missing_rest_in boolean not null default false,
  needs_review boolean not null default false,
  exception_type text check (
    exception_type is null
    or exception_type in ('missing_rest_in')
  ),
  audit_notes text,
  last_updated_at timestamptz,
  client_device_time timestamptz,
  server_created_at timestamptz not null default now(),
  time_difference_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists attendance_shop_date_idx on public.attendance (shop_id, event_date);
create index if not exists attendance_staff_date_idx on public.attendance (staff_id, event_date);
create index if not exists attendance_created_idx on public.attendance (staff_id, created_at desc);

comment on table public.attendance is 'Clock events at a shop; staff can clock from any shop. Ordering uses created_at.';
comment on column public.shops.allowed_radius_meters is 'Max distance (m) from shop coords for clock in/out.';
comment on column public.attendance.gps_verified is 'True when staff was within allowed_radius_meters at punch time.';
comment on column public.attendance.client_device_time is 'Optional device clock at punch (audit only).';
comment on column public.attendance.server_created_at is 'Authoritative punch instant from database now().';
comment on column public.attendance.time_difference_seconds is 'abs(client_device_time - server_created_at) in seconds.';
comment on table public.staff is 'Staff identity; assign shops via staff_shop_assignments.';
comment on table public.staff_shop_assignments is 'Shops a staff member may clock in/out at.';

create table if not exists public.forgot_punch_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  request_type text not null check (request_type in ('forgot_clock_in', 'forgot_clock_out', 'forgot_rest_out', 'forgot_rest_in')),
  requested_time timestamptz not null,
  reason text not null check (
    reason in ('forgot_to_punch', 'phone_issue', 'gps_issue', 'other')
  ),
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  attendance_id uuid references public.attendance (id) on delete set null,
  reviewed_by text,
  reviewed_at timestamptz,
  audit_old_json jsonb,
  audit_new_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forgot_punch_requests_shop_status_idx
  on public.forgot_punch_requests (shop_id, status, created_at desc);

-- updated_at on shops
create or replace function public.shops_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shops_set_updated_at on public.shops;
create trigger shops_set_updated_at
  before update on public.shops
  for each row execute function public.shops_set_updated_at();

-- updated_at on staff
create or replace function public.staff_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists staff_set_updated_at on public.staff;
create trigger staff_set_updated_at
  before update on public.staff
  for each row execute function public.staff_set_updated_at();

-- Authoritative punch times from DB now() in Asia/Kuala_Lumpur (never trust client clock).
create or replace function public.attendance_set_server_times()
returns trigger language plpgsql as $$
declare
  server_ts timestamptz;
  myt_local timestamp;
begin
  server_ts := now();
  new.server_created_at := server_ts;
  new.created_at := coalesce(new.created_at, server_ts);
  myt_local := timezone('Asia/Kuala_Lumpur', server_ts);
  new.event_date := myt_local::date;
  new.event_time := to_char(myt_local, 'HH24:MI:SS');
  if new.client_device_time is not null then
    new.time_difference_seconds :=
      round(abs(extract(epoch from (new.client_device_time - server_ts))))::integer;
  else
    new.time_difference_seconds := null;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_set_server_times on public.attendance;
create trigger attendance_set_server_times
  before insert on public.attendance
  for each row execute function public.attendance_set_server_times();

-- =============================================================================
-- Row Level Security (see migrations/011_enable_rls_security.sql for full script)
-- =============================================================================
alter table if exists public.shops enable row level security;
alter table if exists public.shop_gps_locations enable row level security;
alter table if exists public.staff enable row level security;
alter table if exists public.staff_shop_assignments enable row level security;
alter table if exists public.attendance enable row level security;

alter table if exists public.shops force row level security;
alter table if exists public.shop_gps_locations force row level security;
alter table if exists public.staff force row level security;
alter table if exists public.staff_shop_assignments force row level security;
alter table if exists public.attendance force row level security;

revoke all on table public.shops from anon, authenticated;
revoke all on table public.shop_gps_locations from anon, authenticated;
revoke all on table public.staff from anon, authenticated;
revoke all on table public.staff_shop_assignments from anon, authenticated;
revoke all on table public.attendance from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
