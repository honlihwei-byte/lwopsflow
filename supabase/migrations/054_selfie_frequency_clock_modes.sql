-- Clock-in-only / clock-in-out selfie modes + not_required upload status.

alter table public.shops drop constraint if exists shops_selfie_proof_mode_check;
alter table public.shops add constraint shops_selfie_proof_mode_check
  check (
    selfie_proof_mode is null
    or selfie_proof_mode in (
      'off',
      'always',
      'risk',
      'random',
      'clock_in_only',
      'clock_in_out'
    )
  );

alter table public.companies drop constraint if exists companies_selfie_proof_mode_check;
alter table public.companies add constraint companies_selfie_proof_mode_check
  check (
    selfie_proof_mode in (
      'off',
      'always',
      'risk',
      'random',
      'clock_in_only',
      'clock_in_out'
    )
  );

alter table public.attendance drop constraint if exists attendance_selfie_upload_status_check;
alter table public.attendance add constraint attendance_selfie_upload_status_check
  check (selfie_upload_status in ('none', 'pending', 'uploaded', 'failed', 'not_required'));

comment on column public.attendance.selfie_upload_status is
  'none | pending | uploaded | failed | not_required (selfie not required for this punch)';
