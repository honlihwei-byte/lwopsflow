-- Allow late submission with mandatory overdue reason.

alter table public.retail_task_submissions
  add column if not exists overdue_reason text;

comment on column public.retail_task_submissions.overdue_reason is
  'Required explanation when task was submitted after due time.';
