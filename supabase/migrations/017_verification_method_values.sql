-- Expand verification_method values (gps, indoor_confidence, indoor_fallback, photo_proof).

alter table public.attendance
  drop constraint if exists attendance_verification_method_check;

alter table public.attendance
  add constraint attendance_verification_method_check
  check (
    verification_method is null
    or verification_method in (
      'gps',
      'indoor_confidence',
      'indoor_fallback',
      'photo_proof',
      'gps_verified',
      'gps_weak_indoor'
    )
  );

comment on column public.attendance.verification_method is
  'gps | indoor_confidence | indoor_fallback | photo_proof (legacy: gps_verified, gps_weak_indoor).';
