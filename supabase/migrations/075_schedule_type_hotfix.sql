-- URGENT hotfix: add schedule_type when migration 074 not yet applied.
-- Idempotent. Uses UPPERCASE values (matches app code). Safe to re-run.

alter table public.staff_schedules
  add column if not exists schedule_type text;

update public.staff_schedules
set schedule_type = 'SHIFT'
where schedule_type is null
  and start_time is not null
  and end_time is not null
  and upper(trim(coalesce(start_time::text, ''))) not in ('NS', 'RD', 'MC', 'AL', 'UL', 'EL')
  and upper(trim(coalesce(end_time::text, ''))) not in ('NS', 'RD', 'MC', 'AL', 'UL', 'EL');

update public.staff_schedules
set schedule_type = case upper(trim(coalesce(start_time::text, end_time::text, '')))
  when 'NS' then 'NOT_SCHEDULED'
  when 'RD' then 'RD'
  when 'MC' then 'MC'
  when 'AL' then 'AL'
  when 'UL' then 'UL'
  when 'EL' then 'EL'
  else 'NOT_SCHEDULED'
end
where schedule_type is null
  and (start_time is null or end_time is null or is_off_day is true);

update public.staff_schedules
set schedule_type = 'SHIFT'
where schedule_type is null;

alter table public.staff_schedules
  alter column schedule_type set default 'SHIFT';

comment on column public.staff_schedules.schedule_type is
  'SHIFT = timed shift. RD/MC/AL/UL/EL/NOT_SCHEDULED = status only. Run 074 for full constraints.';
