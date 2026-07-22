-- Admin-assigned shifts (not employee self-scheduling).
-- Adds explicit per-date schedules for attendance matching (no QR/punch changes).

create table if not exists public.staff_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0,
  repeat_type text not null default 'one_day'
    check (repeat_type in ('one_day', 'weekly', 'bi_weekly', 'monthly')),
  created_by text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_schedules_staff_date_idx
  on public.staff_schedules (staff_id, shift_date, status);
create index if not exists staff_schedules_shop_date_idx
  on public.staff_schedules (shop_id, shift_date, status);
create index if not exists staff_schedules_company_date_idx
  on public.staff_schedules (company_id, shift_date, status);

comment on table public.staff_schedules is 'Admin-assigned per-date staff shifts for scheduling + attendance matching.';

