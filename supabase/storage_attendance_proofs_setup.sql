-- Run in Supabase SQL Editor if migration 016 bucket insert did not run.
-- Also applied automatically by: supabase/migrations/016_ensure_photo_proof_schema.sql

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

-- App uploads via SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). No public read policy required.
