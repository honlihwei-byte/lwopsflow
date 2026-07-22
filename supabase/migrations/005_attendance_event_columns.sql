-- Ensure attendance has event_date/event_time; stop trigger that references optional audit columns.

alter table public.attendance
  add column if not exists event_date date,
  add column if not exists event_time text;

update public.attendance
set
  event_date = coalesce(
    event_date,
    (timezone('Asia/Kuala_Lumpur', created_at))::date
  ),
  event_time = coalesce(
    event_time,
    to_char(timezone('Asia/Kuala_Lumpur', created_at), 'HH24:MI:SS')
  )
where event_date is null or event_time is null;

drop trigger if exists attendance_set_server_times on public.attendance;

comment on column public.attendance.event_date is 'Calendar date of punch (set by application on insert).';
comment on column public.attendance.event_time is 'Wall-clock time of punch HH:MM:SS (set by application on insert).';
