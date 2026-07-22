-- Payroll mode (company) and per-shop weak-GPS security flag.

alter table public.companies
  add column if not exists payroll_mode text not null default 'scheduled_hours';

alter table public.companies drop constraint if exists companies_payroll_mode_check;
alter table public.companies add constraint companies_payroll_mode_check
  check (payroll_mode in ('actual_hours', 'scheduled_hours'));

comment on column public.companies.payroll_mode is
  'actual_hours = punch duration; scheduled_hours = shift schedule (recommended for payroll).';

alter table public.shops
  add column if not exists security_weak_gps_alert boolean not null default false;

comment on column public.shops.security_weak_gps_alert is
  'When true, weak indoor GPS punches are flagged for security review at this shop.';
