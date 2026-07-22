-- Safe upgrade for databases that still have staff.shop_id NOT NULL.
-- Does not modify or delete attendance rows.
-- Run in Supabase SQL Editor if migration 002 was never applied.

-- 1) Junction table for multi-shop staff
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

-- 2) Copy legacy home shop into assignments (idempotent)
insert into public.staff_shop_assignments (staff_id, shop_id)
select s.id, s.shop_id
from public.staff s
where s.shop_id is not null
on conflict (staff_id, shop_id) do nothing;

-- 3) Allow new staff rows without shop_id on staff (column kept for legacy data)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff'
      and column_name = 'shop_id'
  ) then
    alter table public.staff alter column shop_id drop not null;
  end if;
end $$;

comment on table public.staff_shop_assignments is 'Shops a staff member may clock in/out at.';
comment on table public.staff is 'Staff identity; assign shops via staff_shop_assignments.';
