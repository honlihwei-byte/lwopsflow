-- Anti-buddy-punch: trusted devices, risk scoring, random selfie company settings.

alter table public.companies
  add column if not exists random_selfie_enabled boolean not null default false,
  add column if not exists random_selfie_percent smallint not null default 0;

alter table public.companies drop constraint if exists companies_random_selfie_percent_check;
alter table public.companies add constraint companies_random_selfie_percent_check
  check (random_selfie_percent in (0, 5, 10, 20));

create table if not exists public.staff_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  device_id text not null,
  browser_info text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (staff_id, device_id)
);

create index if not exists staff_trusted_devices_staff_idx
  on public.staff_trusted_devices (staff_id);
create index if not exists staff_trusted_devices_device_idx
  on public.staff_trusted_devices (company_id, device_id);

alter table public.attendance
  add column if not exists risk_score smallint not null default 0,
  add column if not exists risk_level text not null default 'low',
  add column if not exists device_trust_status text,
  add column if not exists buddy_punch_flag boolean not null default false,
  add column if not exists risk_flags jsonb not null default '[]'::jsonb,
  add column if not exists punch_browser_info text;

alter table public.attendance drop constraint if exists attendance_risk_level_check;
alter table public.attendance add constraint attendance_risk_level_check
  check (risk_level in ('low', 'medium', 'high'));

alter table public.attendance drop constraint if exists attendance_device_trust_status_check;
alter table public.attendance add constraint attendance_device_trust_status_check
  check (
    device_trust_status is null
    or device_trust_status in ('trusted', 'new_device')
  );

comment on table public.staff_trusted_devices is 'Per-staff browser/device binding after first successful punch.';
comment on column public.attendance.risk_flags is 'JSON array of risk reason codes, e.g. new_device, buddy_punch.';
