-- GPS punch audit fields for admin attendance log.

alter table public.attendance
  add column if not exists gps_radius_used_meters double precision;

alter table public.attendance
  add column if not exists gps_confidence_label text;

alter table public.attendance
  add column if not exists gps_verify_attempt smallint;

alter table public.attendance
  add column if not exists gps_result_reason text;

comment on column public.attendance.gps_radius_used_meters is
  'Effective pass radius at punch time (base or expanded fallback).';
comment on column public.attendance.gps_confidence_label is
  'Staff-facing confidence label at punch (Good/Fair/Weak/Rejected).';
comment on column public.attendance.gps_verify_attempt is
  'Indoor verify attempt 1–3 when progressive radius fallback was used.';
comment on column public.attendance.gps_result_reason is
  'Human-readable GPS approval reason (tier, fallback, session grace).';
