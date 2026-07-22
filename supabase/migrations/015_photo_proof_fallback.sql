-- Photo proof fallback when GPS fails at indoor/high-rise shops.
-- Columns only (storage bucket in 016) so a bucket error cannot roll back schema.

alter table public.shops
  add column if not exists allow_photo_proof_fallback boolean default false;

update public.shops
set allow_photo_proof_fallback = false
where allow_photo_proof_fallback is null;

alter table public.shops
  alter column allow_photo_proof_fallback set default false;

alter table public.shops
  alter column allow_photo_proof_fallback set not null;

comment on column public.shops.allow_photo_proof_fallback is
  'When true, staff may clock in/out with live camera photo if GPS verification fails.';

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

alter table public.attendance
  alter column photo_proof_used set not null;

alter table public.attendance
  alter column review_required set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conname = 'attendance_verification_method_check'
  ) then
    alter table public.attendance
      add constraint attendance_verification_method_check
      check (
        verification_method is null
        or verification_method in ('gps_verified', 'gps_weak_indoor', 'photo_proof')
      );
  end if;
end $$;

comment on column public.attendance.photo_proof_used is
  'True when punch used live camera photo instead of GPS verification.';
comment on column public.attendance.photo_proof_path is
  'Supabase Storage path in attendance-proofs bucket.';
comment on column public.attendance.photo_proof_uploaded_at is
  'When photo proof image was stored (server time).';
comment on column public.attendance.verification_method is
  'How punch was verified: gps_verified, gps_weak_indoor, or photo_proof.';
comment on column public.attendance.review_required is
  'Admin should review punch (photo proof or weak GPS).';
