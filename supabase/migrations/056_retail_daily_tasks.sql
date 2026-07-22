-- Retail Daily Task module (new tables only; no changes to existing columns).

-- Task-specific staff roles (does not modify public.staff columns).
create table if not exists public.staff_task_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  role text not null check (role in ('manager', 'supervisor', 'staff')),
  created_at timestamptz not null default now(),
  unique (company_id, staff_id)
);

create table if not exists public.staff_task_manager_shops (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (staff_id, shop_id)
);

create table if not exists public.retail_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  assigned_staff_id uuid references public.staff (id) on delete set null,
  verifier_staff_id uuid references public.staff (id) on delete set null,
  title text not null,
  description text,
  category text not null,
  priority text not null default 'normal'
    check (priority in ('normal', 'important', 'urgent')),
  status text not null default 'pending'
    check (status in (
      'pending', 'in_progress', 'submitted', 'verified', 'rejected',
      'overdue', 'exception_reported'
    )),
  due_date date not null,
  due_time time,
  repeat_type text not null default 'one_time'
    check (repeat_type in ('one_time', 'daily', 'weekly')),
  photo_required boolean not null default false,
  gps_required boolean not null default false,
  feedback_allowed boolean not null default true,
  created_by text,
  started_at timestamptz,
  started_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retail_tasks_company_shop_date_idx
  on public.retail_tasks (company_id, shop_id, due_date);
create index if not exists retail_tasks_assigned_idx
  on public.retail_tasks (assigned_staff_id, due_date) where assigned_staff_id is not null;
create index if not exists retail_tasks_status_idx
  on public.retail_tasks (company_id, status, due_date);

create table if not exists public.retail_task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.retail_tasks (id) on delete cascade,
  submitted_by uuid not null references public.staff (id) on delete cascade,
  photo_url text,
  comment text,
  gps_lat double precision,
  gps_lng double precision,
  gps_distance_meters double precision,
  gps_status text,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted'
    check (status in ('submitted', 'superseded'))
);

create index if not exists retail_task_submissions_task_idx
  on public.retail_task_submissions (task_id, submitted_at desc);

create table if not exists public.retail_task_feedback (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.retail_tasks (id) on delete cascade,
  submitted_by uuid not null references public.staff (id) on delete cascade,
  reason_type text not null,
  reason_text text not null,
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.retail_task_activity_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.retail_tasks (id) on delete cascade,
  actor_id uuid references public.staff (id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action_type text not null,
  old_status text,
  new_status text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists retail_task_activity_task_idx
  on public.retail_task_activity_logs (task_id, created_at desc);

create table if not exists public.retail_task_verifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.retail_tasks (id) on delete cascade,
  submission_id uuid references public.retail_task_submissions (id) on delete set null,
  verifier_id uuid not null references public.staff (id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  rejection_reason text,
  verified_at timestamptz not null default now()
);

comment on table public.retail_tasks is 'Retail store daily execution tasks (checklists, POP, cleaning, etc.).';
comment on table public.staff_task_roles is 'Task module roles per staff (manager/supervisor/staff). Does not replace admin auth.';

-- Storage bucket for task proof photos (application uploads via service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'retail-task-proofs',
  'retail-task-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
