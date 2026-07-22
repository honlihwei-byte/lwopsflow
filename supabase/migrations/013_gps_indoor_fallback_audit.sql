-- Indoor GPS fallback audit: expanded radius pass for weak high-rise signals.

alter table public.attendance
  add column if not exists gps_original_radius_meters double precision;

alter table public.attendance
  add column if not exists gps_expanded_radius_meters double precision;

alter table public.attendance
  add column if not exists gps_indoor_fallback_used boolean;

update public.attendance
set gps_indoor_fallback_used = false
where gps_indoor_fallback_used is null;

alter table public.attendance
  alter column gps_indoor_fallback_used set default false;

alter table public.attendance
  alter column gps_indoor_fallback_used set not null;

comment on column public.attendance.gps_original_radius_meters is
  'Configured allowed_radius_meters of matched shop_gps_locations point at punch.';
comment on column public.attendance.gps_expanded_radius_meters is
  'Expanded pass radius (m) when indoor fallback matched (×1.5 or ×2, cap 200m).';
comment on column public.attendance.gps_indoor_fallback_used is
  'True when punch passed via trusted indoor radius expansion (weak GPS, score ≥60).';
