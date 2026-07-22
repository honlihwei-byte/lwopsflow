-- Task submission: multiple proof photos + cleaning checklist completion.

alter table public.retail_task_submissions
  add column if not exists photo_urls jsonb not null default '[]'::jsonb,
  add column if not exists checklist_completed jsonb;

comment on column public.retail_task_submissions.photo_urls is
  'Storage paths for all proof photos (watermarked). photo_url kept as first entry for compatibility.';
comment on column public.retail_task_submissions.checklist_completed is
  'Checklist item completion map for cleaning tasks, e.g. {"sweep_floor": true}.';
