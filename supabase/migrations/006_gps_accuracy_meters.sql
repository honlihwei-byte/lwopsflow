alter table public.attendance
  add column if not exists gps_accuracy_meters double precision;

comment on column public.attendance.gps_accuracy_meters is 'Device-reported GPS accuracy (m) at punch; lower is better.';
