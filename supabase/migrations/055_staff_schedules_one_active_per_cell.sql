-- Enforce one active schedule per staff + shop + date (repair existing duplicates first).

with ranked as (
  select
    id,
    row_number() over (
      partition by staff_id, shop_id, shift_date
      order by updated_at desc, created_at desc
    ) as rn
  from public.staff_schedules
  where status = 'active'
)
update public.staff_schedules s
set
  status = 'cancelled',
  updated_at = now()
from ranked r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists staff_schedules_one_active_per_cell_idx
  on public.staff_schedules (company_id, staff_id, shop_id, shift_date)
  where status = 'active';

comment on index public.staff_schedules_one_active_per_cell_idx is
  'At most one active assignment per company/staff/shop/date.';
