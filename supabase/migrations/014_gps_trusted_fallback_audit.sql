-- Trusted indoor fallback window audit (device + 30 min window).

alter table public.attendance
  add column if not exists gps_trusted_window_used boolean;

alter table public.attendance
  add column if not exists punch_device_id text;

update public.attendance
set gps_trusted_window_used = false
where gps_trusted_window_used is null;

alter table public.attendance
  alter column gps_trusted_window_used set default false;

alter table public.attendance
  alter column gps_trusted_window_used set not null;

comment on column public.attendance.gps_trusted_window_used is
  'True when indoor expanded-radius pass used active trusted device window (≥3 verifies / 30 min).';
comment on column public.attendance.punch_device_id is
  'Browser-stable device id at punch for trusted-window audit.';
