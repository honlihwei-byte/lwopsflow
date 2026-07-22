-- Selfie proof (front-camera identity verification) — separate from location photo_proof.

alter table public.companies
  add column if not exists selfie_proof_mode text not null default 'off';

alter table public.companies drop constraint if exists companies_selfie_proof_mode_check;
alter table public.companies add constraint companies_selfie_proof_mode_check
  check (selfie_proof_mode in ('off', 'always', 'risk', 'random'));

alter table public.companies
  add column if not exists selfie_proof_random_percent smallint not null default 0;

alter table public.companies drop constraint if exists companies_selfie_proof_random_percent_check;
alter table public.companies add constraint companies_selfie_proof_random_percent_check
  check (selfie_proof_random_percent in (0, 5, 10, 20));

comment on column public.companies.selfie_proof_mode is
  'off | always | risk (new device/high risk) | random (use selfie_proof_random_percent).';
comment on column public.companies.selfie_proof_random_percent is
  'Random selfie proof sampling when selfie_proof_mode = random.';

alter table public.attendance
  add column if not exists selfie_proof_used boolean not null default false,
  add column if not exists selfie_proof_path text,
  add column if not exists selfie_captured_at timestamptz;

alter table public.attendance drop constraint if exists attendance_verification_method_check;
alter table public.attendance add constraint attendance_verification_method_check
  check (
    verification_method is null
    or verification_method in (
      'gps',
      'indoor_confidence',
      'indoor_fallback',
      'photo_proof',
      'random_selfie',
      'selfie_proof',
      'manual_approval',
      'gps_verified',
      'gps_weak_indoor'
    )
  );

comment on column public.attendance.selfie_proof_used is 'Front-camera selfie identity verification at punch.';
comment on column public.attendance.selfie_proof_path is 'Storage path in attendance-selfies bucket.';
comment on column public.attendance.selfie_captured_at is 'When selfie was captured on device.';

-- Storage bucket (run in Supabase dashboard or via storage API if not exists):
-- insert into storage.buckets (id, name, public) values ('attendance-selfies', 'attendance-selfies', false)
-- on conflict (id) do nothing;
