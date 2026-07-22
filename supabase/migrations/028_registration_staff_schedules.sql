-- Company registration fields, email verification, staff schedules (no attendance/QR changes).

-- Company profile + pending verification status
alter table public.companies
  add column if not exists business_type text,
  add column if not exists staff_estimate text,
  add column if not exists country text default 'MY',
  add column if not exists timezone text default 'Asia/Kuala_Lumpur',
  add column if not exists email_verified_at timestamptz;

alter table public.companies drop constraint if exists companies_status_check;
alter table public.companies add constraint companies_status_check
  check (status in ('trial', 'active', 'suspended', 'expired', 'pending_email_verification'));

-- Email verification tokens (link or OTP)
create table if not exists public.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  token_hash text not null,
  otp_code text,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_company_idx
  on public.email_verification_tokens (company_id);
create index if not exists email_verification_token_hash_idx
  on public.email_verification_tokens (token_hash);

-- Staff scheduling fields
alter table public.staff
  add column if not exists phone text,
  add column if not exists allow_punch boolean not null default true,
  add column if not exists reporting_manager text,
  add column if not exists schedule_mode text not null default 'fixed_daily',
  add column if not exists default_start_time time not null default '09:00',
  add column if not exists default_end_time time not null default '18:00',
  add column if not exists schedule_timezone text default 'Asia/Kuala_Lumpur';

alter table public.staff drop constraint if exists staff_schedule_mode_check;
alter table public.staff add constraint staff_schedule_mode_check
  check (schedule_mode in (
    'fixed_daily',
    'weekly',
    'bi_weekly',
    'monthly',
    'custom'
  ));

create table if not exists public.staff_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  day_of_week smallint check (day_of_week is null or (day_of_week >= 0 and day_of_week <= 6)),
  schedule_date date,
  biweekly_week smallint check (biweekly_week is null or biweekly_week in (1, 2)),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_schedule_slots_staff_idx
  on public.staff_schedule_slots (staff_id);
create index if not exists staff_schedule_slots_date_idx
  on public.staff_schedule_slots (staff_id, schedule_date);

-- Legacy staff: fixed 9–6, allow punch
update public.staff
set
  schedule_mode = coalesce(nullif(schedule_mode, ''), 'fixed_daily'),
  default_start_time = coalesce(default_start_time, '09:00'::time),
  default_end_time = coalesce(default_end_time, '18:00'::time),
  allow_punch = coalesce(allow_punch, true),
  schedule_timezone = coalesce(schedule_timezone, 'Asia/Kuala_Lumpur')
where schedule_mode is null
   or default_start_time is null
   or default_end_time is null;

comment on table public.staff_schedule_slots is 'Per-staff shift windows; day_of_week 0=Mon … 6=Sun.';
