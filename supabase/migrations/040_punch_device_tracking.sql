-- Rich device metadata on every punch + fingerprint alias.

alter table public.attendance
  add column if not exists device_fingerprint text,
  add column if not exists punch_device_name text,
  add column if not exists punch_browser text,
  add column if not exists punch_platform text,
  add column if not exists punch_user_agent text;

update public.attendance
set device_fingerprint = punch_device_id
where device_fingerprint is null and punch_device_id is not null;

comment on column public.attendance.device_fingerprint is 'Stable client device id (same as punch_device_id).';
comment on column public.attendance.punch_device_name is 'Human-readable device label from client.';
comment on column public.attendance.punch_browser is 'Browser summary at punch time.';
comment on column public.attendance.punch_platform is 'OS/platform at punch time.';
comment on column public.attendance.punch_user_agent is 'Raw user agent at punch time.';
