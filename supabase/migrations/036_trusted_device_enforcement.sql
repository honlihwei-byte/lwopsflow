-- Trusted device enforcement: approval + company enforcement mode + richer device metadata.

alter table public.companies
  add column if not exists device_enforcement_mode text not null default 'allow_warn';

alter table public.companies drop constraint if exists companies_device_enforcement_mode_check;
alter table public.companies add constraint companies_device_enforcement_mode_check
  check (device_enforcement_mode in ('allow_warn', 'require_approval', 'block_unknown'));

alter table public.staff_trusted_devices
  add column if not exists device_name text,
  add column if not exists os_name text,
  add column if not exists approved boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.admin (id) on delete set null,
  add column if not exists revoked_at timestamptz;

create index if not exists staff_trusted_devices_company_approved_idx
  on public.staff_trusted_devices (company_id, approved);

comment on column public.companies.device_enforcement_mode is 'Trusted device enforcement for punching: allow_warn, require_approval, block_unknown.';
comment on column public.staff_trusted_devices.approved is 'Whether this device is approved/trusted for the staff account.';

