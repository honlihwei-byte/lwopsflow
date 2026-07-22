-- Recurring retail tasks: per-occurrence rows, missed status, monthly repeat.

alter table public.retail_tasks
  add column if not exists series_id uuid;

alter table public.retail_tasks
  drop constraint if exists retail_tasks_status_check;

alter table public.retail_tasks
  add constraint retail_tasks_status_check
  check (status in (
    'pending', 'in_progress', 'submitted', 'verified', 'rejected',
    'overdue', 'exception_reported', 'missed'
  ));

alter table public.retail_tasks
  drop constraint if exists retail_tasks_repeat_type_check;

alter table public.retail_tasks
  add constraint retail_tasks_repeat_type_check
  check (repeat_type in ('one_time', 'daily', 'weekly', 'monthly'));

create unique index if not exists retail_tasks_series_due_date_idx
  on public.retail_tasks (series_id, due_date)
  where series_id is not null;

create index if not exists retail_tasks_series_idx
  on public.retail_tasks (company_id, series_id)
  where series_id is not null;
