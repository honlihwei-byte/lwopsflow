-- Run in Supabase SQL editor if migration 074 failed on staff_schedules_type_times_check.
-- Uses shift_date (not schedule_date). Safe to re-run.

-- Preview violating rows
select id, staff_id, shop_id, shift_date, schedule_type, start_time, end_time, is_off_day, status
from public.staff_schedules
where not (
  (schedule_type = 'SHIFT' and start_time is not null and end_time is not null)
  or (schedule_type <> 'SHIFT' and start_time is null and end_time is null)
);

-- Repair (same logic as migration 074)
update public.staff_schedules
set schedule_type = 'NOT_SCHEDULED', start_time = null, end_time = null, is_off_day = true
where schedule_type is null
  and (start_time is null or end_time is null);

update public.staff_schedules
set schedule_type = 'SHIFT'
where schedule_type is null
  and start_time is not null
  and end_time is not null;

update public.staff_schedules
set start_time = null, end_time = null, is_off_day = true
where schedule_type in ('RD', 'MC', 'AL', 'UL', 'EL', 'NOT_SCHEDULED')
  and (start_time is not null or end_time is not null);

update public.staff_schedules
set schedule_type = 'NOT_SCHEDULED', start_time = null, end_time = null, is_off_day = true
where schedule_type = 'SHIFT'
  and (start_time is null or end_time is null);

-- Re-apply constraint if missing
alter table public.staff_schedules drop constraint if exists staff_schedules_type_times_check;
alter table public.staff_schedules
  add constraint staff_schedules_type_times_check
  check (
    (schedule_type = 'SHIFT' and start_time is not null and end_time is not null)
    or (schedule_type <> 'SHIFT' and start_time is null and end_time is null)
  );
