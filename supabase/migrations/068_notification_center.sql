-- LW OpsFlow Notification Center (in-app + browser push; no WhatsApp).

-- Task template / series with per-template notification settings.
create table if not exists public.retail_task_series (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text not null,
  repeat_type text not null default 'one_time'
    check (repeat_type in ('one_time', 'daily', 'weekly', 'monthly')),
  anchor_due_date date not null,
  due_time time,
  notify_assigned_staff boolean not null default true,
  notify_supervisor boolean not null default false,
  notify_store_manager boolean not null default false,
  reminder_offset_minutes int
    check (reminder_offset_minutes is null or reminder_offset_minutes in (15, 30, 60)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retail_task_series_company_idx
  on public.retail_task_series (company_id, shop_id);

-- Link recurring instances to series metadata (067 added bare series_id uuid).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'retail_tasks_series_id_fkey'
  ) then
    alter table public.retail_tasks
      add constraint retail_tasks_series_id_fkey
      foreign key (series_id) references public.retail_task_series (id) on delete set null;
  end if;
exception
  when others then null;
end $$;

-- Primary notification store.
create table if not exists public.ops_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  shop_id uuid references public.shops (id) on delete set null,
  type text not null check (type in (
    'task_assigned',
    'task_due_soon',
    'task_overdue',
    'task_verified',
    'task_rejected',
    'schedule_updated',
    'attendance_exception'
  )),
  title text not null,
  message text,
  read_at timestamptz,
  related_task_id uuid references public.retail_tasks (id) on delete set null,
  related_schedule_id uuid references public.staff_schedules (id) on delete set null,
  fire_key text not null default 'default',
  link_path text,
  created_at timestamptz not null default now()
);

create unique index if not exists ops_notifications_task_dedupe_idx
  on public.ops_notifications (related_task_id, staff_id, type, fire_key)
  where related_task_id is not null;

create unique index if not exists ops_notifications_schedule_dedupe_idx
  on public.ops_notifications (related_schedule_id, staff_id, type, fire_key)
  where related_schedule_id is not null;

create index if not exists ops_notifications_staff_unread_idx
  on public.ops_notifications (staff_id, created_at desc)
  where read_at is null;

create index if not exists ops_notifications_company_idx
  on public.ops_notifications (company_id, created_at desc);

-- Per-employee notification preferences.
create table if not exists public.staff_notification_preferences (
  staff_id uuid primary key references public.staff (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  notifications_enabled boolean not null default true,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Browser push subscriptions (Web Push API).
create table if not exists public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (staff_id, endpoint)
);

create index if not exists staff_push_subscriptions_staff_idx
  on public.staff_push_subscriptions (staff_id);
