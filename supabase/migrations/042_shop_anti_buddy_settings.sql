-- Per-shop anti-buddy punch and attendance verification settings.

alter table public.shops
  add column if not exists attendance_verification_mode text not null default 'gps_only';

alter table public.shops drop constraint if exists shops_attendance_verification_mode_check;
alter table public.shops add constraint shops_attendance_verification_mode_check
  check (
    attendance_verification_mode in (
      'gps_only',
      'gps_selfie',
      'gps_location_proof',
      'gps_selfie_location_proof'
    )
  );

alter table public.shops
  add column if not exists anti_buddy_detect_new_device boolean not null default true,
  add column if not exists anti_buddy_detect_device_mismatch boolean not null default true,
  add column if not exists anti_buddy_detect_shared_device boolean not null default true,
  add column if not exists anti_buddy_flag_rapid_punches boolean not null default true,
  add column if not exists anti_buddy_require_review_high_risk boolean not null default true;

alter table public.shops
  add column if not exists selfie_proof_mode text,
  add column if not exists selfie_proof_random_percent smallint;

alter table public.shops drop constraint if exists shops_selfie_proof_mode_check;
alter table public.shops add constraint shops_selfie_proof_mode_check
  check (
    selfie_proof_mode is null
    or selfie_proof_mode in ('off', 'always', 'risk', 'random')
  );

alter table public.shops drop constraint if exists shops_selfie_proof_random_percent_check;
alter table public.shops add constraint shops_selfie_proof_random_percent_check
  check (
    selfie_proof_random_percent is null
    or selfie_proof_random_percent in (0, 5, 10, 20)
  );

alter table public.shops
  add column if not exists device_enforcement_mode text;

alter table public.shops drop constraint if exists shops_device_enforcement_mode_check;
alter table public.shops add constraint shops_device_enforcement_mode_check
  check (
    device_enforcement_mode is null
    or device_enforcement_mode in ('allow_warn', 'require_approval', 'block_unknown')
  );

comment on column public.shops.attendance_verification_mode is
  'gps_only | gps_selfie | gps_location_proof | gps_selfie_location_proof';
comment on column public.shops.selfie_proof_mode is 'Null inherits company selfie_proof_mode.';

-- Align legacy photo-proof shops with location-proof mode.
update public.shops
set attendance_verification_mode = 'gps_location_proof'
where allow_photo_proof_fallback = true
  and attendance_verification_mode = 'gps_only';
