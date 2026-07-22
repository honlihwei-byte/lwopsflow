-- Rest In / Rest Out (break) punches + missing-rest-in exception flags.
-- Phase 1: state machine support. Salary/score impact and admin correction UI are follow-ups.

-- Allow break punch action types alongside clock in/out.
alter table public.attendance
  drop constraint if exists attendance_action_type_check;

alter table public.attendance
  add constraint attendance_action_type_check
  check (action_type in ('clock_in', 'clock_out', 'rest_in', 'rest_out'));

-- Attendance-day exception flags (written on the closing clock_out punch).
alter table public.attendance
  add column if not exists missing_rest_in boolean not null default false;

alter table public.attendance
  add column if not exists needs_review boolean not null default false;

alter table public.attendance
  add column if not exists exception_type text
  check (
    exception_type is null
    or exception_type in ('missing_rest_in')
  );

comment on column public.attendance.missing_rest_in is
  'True on a clock_out saved while the employee was still on break (no rest_in).';
comment on column public.attendance.needs_review is
  'Attendance exception flag for admin/supervisor review (separate from GPS review_required).';
comment on column public.attendance.exception_type is
  'Attendance exception classification, e.g. missing_rest_in.';

create index if not exists attendance_needs_review_idx
  on public.attendance (needs_review)
  where needs_review = true;
