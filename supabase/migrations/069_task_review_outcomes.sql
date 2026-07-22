-- Three-outcome task review: accepted / fair / rejected (replaces approved / rejected).

alter table public.retail_task_verifications
  drop constraint if exists retail_task_verifications_decision_check;

update public.retail_task_verifications
  set decision = 'accepted'
  where decision = 'approved';

alter table public.retail_task_verifications
  add constraint retail_task_verifications_decision_check
  check (decision in ('accepted', 'fair', 'rejected'));

comment on column public.retail_task_verifications.rejection_reason is
  'Manager feedback — required when rejected, optional for fair.';

alter table public.retail_tasks
  drop constraint if exists retail_tasks_status_check;

alter table public.retail_tasks
  add constraint retail_tasks_status_check
  check (status in (
    'pending', 'in_progress', 'submitted', 'verified', 'fair', 'rejected',
    'overdue', 'exception_reported', 'missed'
  ));
