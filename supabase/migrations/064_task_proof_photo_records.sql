-- photo_urls jsonb entries: { original_path, display_path, captured_at } (ISO UTC, server time).
-- Legacy string paths remain supported in application code.

comment on column public.retail_task_submissions.photo_urls is
  'Array of proof photo records: original_path (compressed), display_path (watermarked), captured_at (server ISO UTC).';
