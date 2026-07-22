-- Shop-based scheduling: operating hours, work time mode, shift templates.
-- Does not alter attendance or QR routes.

alter table public.shops
  add column if not exists work_time_mode text not null default 'fixed'
    check (work_time_mode in ('fixed', 'shift_based'));

alter table public.shops
  add column if not exists opening_time time default '10:00';

alter table public.shops
  add column if not exists closing_time time default '21:00';

alter table public.shops
  add column if not exists break_minutes integer not null default 60;

comment on column public.shops.work_time_mode is 'fixed = all punch staff use shop hours; shift_based = per-staff assigned shifts';
comment on column public.shops.opening_time is 'Shop opening time (fixed mode schedule source)';
comment on column public.shops.closing_time is 'Shop closing time (fixed mode schedule source)';
comment on column public.shops.break_minutes is 'Default break minutes for fixed mode (and template default)';

create table if not exists public.shop_shift_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_shift_templates_shop_idx
  on public.shop_shift_templates (shop_id, sort_order);

-- Extend admin-assigned staff shifts for shop-based scheduling.
alter table public.staff_schedules
  add column if not exists template_id uuid references public.shop_shift_templates (id) on delete set null;

alter table public.staff_schedules
  add column if not exists is_off_day boolean not null default false;

alter table public.staff_schedules
  alter column start_time drop not null;

alter table public.staff_schedules
  alter column end_time drop not null;

comment on column public.staff_schedules.is_off_day is 'When true, staff is marked off for this date (shift_based mode only)';
comment on column public.staff_schedules.template_id is 'Optional link to shop shift template used for assignment';
