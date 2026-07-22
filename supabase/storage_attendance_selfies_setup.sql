-- Run in Supabase SQL Editor if migration 051 bucket insert did not run.

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

-- Uploads use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). Admin reads via signed URLs in API routes.
