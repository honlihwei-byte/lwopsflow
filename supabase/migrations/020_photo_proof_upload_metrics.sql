-- Photo proof upload size / duration metrics on attendance rows.

alter table public.attendance
  add column if not exists photo_proof_original_file_size integer,
  add column if not exists photo_proof_compressed_file_size integer,
  add column if not exists photo_proof_upload_duration_ms integer;

comment on column public.attendance.photo_proof_original_file_size is
  'Camera file size in bytes before client compression.';
comment on column public.attendance.photo_proof_compressed_file_size is
  'JPEG blob size in bytes uploaded to storage.';
comment on column public.attendance.photo_proof_upload_duration_ms is
  'Client-measured upload duration in milliseconds.';
