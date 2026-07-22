-- Repair migration: ensure company & shop security columns exist (idempotent).
-- Safe to run if 029, 036, 041, 042, or 047 were skipped on a project.

-- Companies: anti-buddy / selfie (029, 041)
alter table public.companies
  add column if not exists random_selfie_enabled boolean not null default false,
  add column if not exists random_selfie_percent smallint not null default 0;

alter table public.companies drop constraint if exists companies_random_selfie_percent_check;
alter table public.companies add constraint companies_random_selfie_percent_check
  check (random_selfie_percent in (0, 5, 10, 20));

alter table public.companies
  add column if not exists selfie_proof_mode text not null default 'off';

alter table public.companies drop constraint if exists companies_selfie_proof_mode_check;
alter table public.companies add constraint companies_selfie_proof_mode_check
  check (selfie_proof_mode in ('off', 'always', 'risk', 'random'));

alter table public.companies
  add column if not exists selfie_proof_random_percent smallint not null default 0;

alter table public.companies drop constraint if exists companies_selfie_proof_random_percent_check;
alter table public.companies add constraint companies_selfie_proof_random_percent_check
  check (selfie_proof_random_percent in (0, 5, 10, 20));

-- Companies: trusted device enforcement (036)
alter table public.companies
  add column if not exists device_enforcement_mode text not null default 'allow_warn';

alter table public.companies drop constraint if exists companies_device_enforcement_mode_check;
alter table public.companies add constraint companies_device_enforcement_mode_check
  check (device_enforcement_mode in ('allow_warn', 'require_approval', 'block_unknown'));

comment on column public.companies.device_enforcement_mode is
  'Trusted device enforcement: allow_warn | require_approval | block_unknown';

-- Companies: payroll (047)
alter table public.companies
  add column if not exists payroll_mode text not null default 'scheduled_hours';

alter table public.companies drop constraint if exists companies_payroll_mode_check;
alter table public.companies add constraint companies_payroll_mode_check
  check (payroll_mode in ('actual_hours', 'scheduled_hours'));

-- Shops: weak GPS alert (047)
alter table public.shops
  add column if not exists security_weak_gps_alert boolean not null default false;

-- Shops: per-shop device mode (042) — nullable inherit
alter table public.shops
  add column if not exists device_enforcement_mode text;

alter table public.shops drop constraint if exists shops_device_enforcement_mode_check;
alter table public.shops add constraint shops_device_enforcement_mode_check
  check (
    device_enforcement_mode is null
    or device_enforcement_mode in ('allow_warn', 'require_approval', 'block_unknown')
  );
