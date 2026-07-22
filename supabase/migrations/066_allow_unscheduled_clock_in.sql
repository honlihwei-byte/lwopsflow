-- Allow employee portal clock-in without a staff schedule row (shift-based shops).
alter table public.companies
  add column if not exists allow_unscheduled_clock_in boolean not null default true;

comment on column public.companies.allow_unscheduled_clock_in is
  'When false, shift-based shops require an active staff schedule for employee portal clock in.';
