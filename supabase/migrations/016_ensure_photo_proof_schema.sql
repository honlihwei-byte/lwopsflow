-- Idempotent repair: photo proof + gps_indoor_mode columns and attendance-proofs bucket.
-- Safe if 015 was skipped, failed, or partially applied.

-- shops
alter table public.shops
  add column if not exists allow_photo_proof_fallback boolean default false;

alter table public.shops
  add column if not exists gps_indoor_mode boolean default false;

update public.shops
set allow_photo_proof_fallback = false
where allow_photo_proof_fallback is null;

update public.shops
set gps_indoor_mode = false
where gps_indoor_mode is null;

alter table public.shops
  alter column allow_photo_proof_fallback set default false;

alter table public.shops
  alter column gps_indoor_mode set default false;

do $$
begin
  alter table public.shops alter column allow_photo_proof_fallback set not null;
exception
  when others then null;
end $$;

do $$
begin
  alter table public.shops alter column gps_indoor_mode set not null;
exception
  when others then null;
end $$;

comment on column public.shops.allow_photo_proof_fallback is
  'When true, staff may clock in/out with live camera photo if GPS verification fails.';

-- attendance
alter table public.attendance
  add column if not exists photo_proof_used boolean default false;

alter table public.attendance
  add column if not exists photo_proof_path text;

alter table public.attendance
  add column if not exists photo_proof_uploaded_at timestamptz;

alter table public.attendance
  add column if not exists verification_method text;

alter table public.attendance
  add column if not exists review_required boolean default false;

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

-- Storage bucket (separate from 015 so column DDL is not rolled back on bucket errors).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-proofs',
  'attendance-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
