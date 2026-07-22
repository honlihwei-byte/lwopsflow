-- Server-authoritative punch times + device clock audit (run after 002).

alter table public.attendance
  add column if not exists client_device_time timestamptz,
  add column if not exists server_created_at timestamptz,
  add column if not exists time_difference_seconds integer;

-- Backfill audit column for existing rows
update public.attendance
set server_created_at = created_at
where server_created_at is null;

alter table public.attendance
  alter column server_created_at set default now();

comment on column public.attendance.client_device_time is 'Optional device clock at punch (audit only; not used for official time).';
comment on column public.attendance.server_created_at is 'Authoritative punch instant from database now().';
comment on column public.attendance.time_difference_seconds is 'abs(client_device_time - server_created_at) in seconds.';

-- Set event_date/event_time from DB now() in Malaysia timezone; ignore any client values.
create or replace function public.attendance_set_server_times()
returns trigger language plpgsql as $$
declare
  server_ts timestamptz;
  myt_local timestamp;
begin
  server_ts := now();
  new.server_created_at := server_ts;
  new.created_at := coalesce(new.created_at, server_ts);

  myt_local := timezone('Asia/Kuala_Lumpur', server_ts);
  new.event_date := myt_local::date;
  new.event_time := to_char(myt_local, 'HH24:MI:SS');

  if new.client_device_time is not null then
    new.time_difference_seconds :=
      round(abs(extract(epoch from (new.client_device_time - server_ts))))::integer;
  else
    new.time_difference_seconds := null;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_set_server_times on public.attendance;
create trigger attendance_set_server_times
  before insert on public.attendance
  for each row execute function public.attendance_set_server_times();
