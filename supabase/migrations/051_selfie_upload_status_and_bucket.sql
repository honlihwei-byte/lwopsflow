-- Selfie upload status + ensure attendance-selfies storage bucket exists.

alter table public.attendance
  add column if not exists selfie_upload_status text not null default 'none';

alter table public.attendance drop constraint if exists attendance_selfie_upload_status_check;
alter table public.attendance add constraint attendance_selfie_upload_status_check
  check (selfie_upload_status in ('none', 'pending', 'uploaded', 'failed'));

comment on column public.attendance.selfie_upload_status is
  'none | pending (captured, upload queued) | uploaded | failed';

-- Private bucket for selfie proof images (service role uploads; signed URLs for admin read).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-selfies',
  'attendance-selfies',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
