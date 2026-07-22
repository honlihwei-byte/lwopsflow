-- In-progress task drafts (checklist, photos, comment) auto-saved until final submit.

create table if not exists public.retail_task_drafts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.retail_tasks (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  photo_urls jsonb not null default '[]'::jsonb,
  checklist_completed jsonb,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, staff_id)
);

create index if not exists retail_task_drafts_task_staff_idx
  on public.retail_task_drafts (task_id, staff_id);

comment on table public.retail_task_drafts is
  'Auto-saved task progress while status is in_progress; deleted on final submit.';
