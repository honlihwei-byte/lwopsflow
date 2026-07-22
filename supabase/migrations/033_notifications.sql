-- Notification storage (no push sending yet).
-- Used for future reminders like: "Tomorrow shift starts at 10:00" or "Shift changed by admin".

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete cascade,
  shop_id uuid references public.shops (id) on delete cascade,
  notification_type text not null,
  title text,
  body text not null,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_staff_idx
  on public.notifications (staff_id, created_at desc);

create index if not exists notifications_company_idx
  on public.notifications (company_id, created_at desc);

comment on table public.notifications is 'Prepared structure for staff/admin notifications. No delivery implementation yet.';

