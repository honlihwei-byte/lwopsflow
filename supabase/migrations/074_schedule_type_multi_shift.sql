-- staff_schedules uses shift_date (not schedule_date).
-- Idempotent: safe to re-run after a partial apply.

-- ---------------------------------------------------------------------------
-- 1. schedule_type column (nullable until backfilled)
-- ---------------------------------------------------------------------------
alter table public.staff_schedules
  add column if not exists schedule_type text;

alter table public.staff_schedules
  drop constraint if exists staff_schedules_schedule_type_check;

-- Times may already be nullable (031); ensure for non-shift rows.
alter table public.staff_schedules alter column start_time drop not null;
alter table public.staff_schedules alter column end_time drop not null;

-- sequence_no for multi-shift (037)
alter table public.staff_schedules
  add column if not exists sequence_no smallint not null default 1;

-- ---------------------------------------------------------------------------
-- 2. Backfill schedule_type from legacy time-column codes (all rows)
-- ---------------------------------------------------------------------------
update public.staff_schedules
set schedule_type = case upper(trim(coalesce(start_time::text, end_time::text, '')))
  when 'NS' then 'NOT_SCHEDULED'
  when 'NOT SCHEDULED' then 'NOT_SCHEDULED'
  when 'NOT_SCHEDULED' then 'NOT_SCHEDULED'
  when 'RD' then 'RD'
  when 'MC' then 'MC'
  when 'AL' then 'AL'
  when 'UL' then 'UL'
  when 'EL' then 'EL'
  else schedule_type
end
where schedule_type is null
  and upper(trim(coalesce(start_time::text, ''))) in (
    'NS', 'NOT SCHEDULED', 'NOT_SCHEDULED', 'RD', 'MC', 'AL', 'UL', 'EL'
  );

update public.staff_schedules
set schedule_type = case upper(trim(coalesce(end_time::text, '')))
  when 'NS' then 'NOT_SCHEDULED'
  when 'NOT SCHEDULED' then 'NOT_SCHEDULED'
  when 'NOT_SCHEDULED' then 'NOT_SCHEDULED'
  when 'RD' then 'RD'
  when 'MC' then 'MC'
  when 'AL' then 'AL'
  when 'UL' then 'UL'
  when 'EL' then 'EL'
  else schedule_type
end
where schedule_type is null
  and upper(trim(coalesce(end_time::text, ''))) in (
    'NS', 'NOT SCHEDULED', 'NOT_SCHEDULED', 'RD', 'MC', 'AL', 'UL', 'EL'
  );

-- Legacy is_off_day without explicit type
update public.staff_schedules
set schedule_type = 'RD'
where schedule_type is null
  and is_off_day is true;

-- Null type + both times present => SHIFT
update public.staff_schedules
set schedule_type = 'SHIFT'
where schedule_type is null
  and start_time is not null
  and end_time is not null;

-- Null type + missing times => NOT_SCHEDULED
update public.staff_schedules
set schedule_type = 'NOT_SCHEDULED'
where schedule_type is null;

-- Normalize alias
update public.staff_schedules
set schedule_type = 'NOT_SCHEDULED'
where schedule_type in ('NS', 'NOT SCHEDULED');

-- ---------------------------------------------------------------------------
-- 3. Enforce times per schedule_type (cleans rows before CHECK)
-- ---------------------------------------------------------------------------

-- Non-SHIFT: clear times
update public.staff_schedules
set
  start_time = null,
  end_time = null,
  is_off_day = true
where schedule_type in ('RD', 'MC', 'AL', 'UL', 'EL', 'NOT_SCHEDULED');

-- SHIFT missing times => NOT_SCHEDULED
update public.staff_schedules
set
  schedule_type = 'NOT_SCHEDULED',
  start_time = null,
  end_time = null,
  is_off_day = true
where schedule_type = 'SHIFT'
  and (start_time is null or end_time is null);

-- SHIFT rows must not be off_day
update public.staff_schedules
set is_off_day = false
where schedule_type = 'SHIFT';

-- Non-SHIFT rows must be off_day
update public.staff_schedules
set is_off_day = true
where schedule_type <> 'SHIFT';

-- ---------------------------------------------------------------------------
-- 4. Defaults + NOT NULL on schedule_type
-- ---------------------------------------------------------------------------
alter table public.staff_schedules
  alter column schedule_type set default 'SHIFT';

update public.staff_schedules
set schedule_type = 'SHIFT'
where schedule_type is null;

alter table public.staff_schedules
  alter column schedule_type set not null;

alter table public.staff_schedules
  add constraint staff_schedules_schedule_type_check
  check (schedule_type in ('SHIFT', 'RD', 'MC', 'AL', 'UL', 'EL', 'NOT_SCHEDULED'));

-- ---------------------------------------------------------------------------
-- 5. Multi-shift indexes (drop old one-row-per-cell constraint)
-- ---------------------------------------------------------------------------
drop index if exists public.staff_schedules_one_active_per_cell_idx;

drop index if exists public.staff_schedules_one_status_per_cell_idx;
create unique index if not exists staff_schedules_one_status_per_cell_idx
  on public.staff_schedules (company_id, staff_id, shop_id, shift_date)
  where status = 'active' and schedule_type <> 'SHIFT';

drop index if exists public.staff_schedules_shift_sequence_idx;
create unique index if not exists staff_schedules_shift_sequence_idx
  on public.staff_schedules (company_id, staff_id, shop_id, shift_date, sequence_no)
  where status = 'active' and schedule_type = 'SHIFT';

-- ---------------------------------------------------------------------------
-- 6. Type/times CHECK (drop first so re-run is safe)
-- ---------------------------------------------------------------------------
alter table public.staff_schedules
  drop constraint if exists staff_schedules_type_times_check;

alter table public.staff_schedules
  add constraint staff_schedules_type_times_check
  check (
    (schedule_type = 'SHIFT' and start_time is not null and end_time is not null)
    or (schedule_type <> 'SHIFT' and start_time is null and end_time is null)
  );

comment on column public.staff_schedules.schedule_type is
  'SHIFT = timed shift (shift_date + start_time/end_time). RD/MC/AL/UL/EL/NOT_SCHEDULED = status only, times null.';

comment on column public.staff_schedules.shift_date is
  'Calendar date for this assignment (YYYY-MM-DD). Not schedule_date.';
