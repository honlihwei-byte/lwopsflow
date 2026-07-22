-- Repair: audit_notes + photo proof columns (idempotent).
-- Run in Supabase SQL Editor if PostgREST reports missing columns in schema cache.

alter table public.attendance
  add column if not exists audit_notes text;

alter table public.attendance
  add column if not exists photo_proof_used boolean;

alter table public.attendance
  add column if not exists photo_proof_path text;

alter table public.attendance
  add column if not exists photo_proof_uploaded_at timestamptz;

alter table public.attendance
  add column if not exists verification_method text;

alter table public.attendance
  add column if not exists review_required boolean;

update public.attendance
set photo_proof_used = false
where photo_proof_used is null;

update public.attendance
set review_required = false
where review_required is null;

alter table public.attendance
  alter column photo_proof_used set default false;

alter table public.attendance
  alter column review_required set default false;

do $$
begin
  alter table public.attendance alter column photo_proof_used set not null;
exception
  when others then null;
end $$;

do $$
begin
  alter table public.attendance alter column review_required set not null;
exception
  when others then null;
end $$;

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

comment on column public.attendance.audit_notes is
  'Audit text: photo proof GPS note, enrichment, or admin review.';
comment on column public.attendance.photo_proof_used is
  'True when punch used live camera photo instead of GPS verification.';
comment on column public.attendance.photo_proof_path is
  'Supabase Storage path in attendance-proofs bucket.';
comment on column public.attendance.photo_proof_uploaded_at is
  'When photo proof image was stored (server time).';
comment on column public.attendance.verification_method is
  'gps | indoor_confidence | indoor_fallback | photo_proof';
comment on column public.attendance.review_required is
  'Admin should review punch (photo proof or weak GPS).';

-- Hint for Supabase: after running, Dashboard → Settings → API may need a moment to refresh schema cache.
