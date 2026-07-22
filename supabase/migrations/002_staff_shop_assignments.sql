-- Multi-shop staff assignments (run after 001_add_gps.sql on existing databases).

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

-- Migrate legacy home shop_id into assignments
insert into public.staff_shop_assignments (staff_id, shop_id)
select s.id, s.shop_id
from public.staff s
where s.shop_id is not null
on conflict (staff_id, shop_id) do nothing;

alter table public.staff drop constraint if exists staff_shop_id_fkey;
drop index if exists public.staff_shop_id_idx;
drop index if exists public.staff_shop_status_idx;
alter table public.staff drop column if exists shop_id;

create index if not exists staff_status_idx on public.staff (status);

comment on table public.staff_shop_assignments is 'Shops a staff member may clock in/out at.';
comment on table public.staff is 'Staff identity; assign shops via staff_shop_assignments.';
