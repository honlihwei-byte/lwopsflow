-- Overdue task submission: store mandatory late reason on retail_task_submissions.
-- Idempotent repair for databases that did not apply 076_task_overdue_submission.sql.
-- Existing rows keep overdue_reason NULL (on-time submissions).

alter table public.retail_task_submissions
  add column if not exists overdue_reason text;

comment on column public.retail_task_submissions.overdue_reason is
  'Explanation when submitted after due time; NULL when submitted on time.';
